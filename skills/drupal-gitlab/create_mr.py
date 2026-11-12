#!/usr/bin/env python3
"""
Open a cross-project merge request from an issue fork to its upstream project
on git.drupalcode.org. `glab mr create` can't do cross-project MRs, and raw
`glab api` stays behind a permission prompt because it can also post comments;
this script does only this one write, so it can be allow-listed on its own.

Usage:
    python3 create_mr.py --fork issue/<project>-<nid> --target project/<project> \
        --source-branch <branch> --target-branch <branch> \
        --title "<title>" --description-file <path>

Refuses a fork outside `issue/`, and a description without the AI disclosure.
If an open MR from the same fork branch already exists (GitLab may auto-create
one on push), prints its URL instead of opening a second one.

Auth: uses `glab`, logged in to git.drupalcode.org.
"""

import argparse
import json
import subprocess
import sys
import urllib.parse

HOST = "git.drupalcode.org"


def die(msg):
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(1)


def api(endpoint, *fields, method="GET"):
    cmd = ["glab", "api", "--hostname", HOST, "--method", method, endpoint, *fields]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True)
    except FileNotFoundError:
        die("glab not found — install it and run `glab auth login -h git.drupalcode.org`.")
    if result.returncode != 0:
        die(f"glab api {method} {endpoint} failed: {(result.stderr or result.stdout).strip()[:300]}")
    return json.loads(result.stdout)


def encode(path):
    return urllib.parse.quote(path, safe="")


def main():
    parser = argparse.ArgumentParser(description="Open a cross-project MR from an issue fork.")
    parser.add_argument("--fork", required=True, help="issue/<project>-<nid>")
    parser.add_argument("--target", required=True, help="project/<project>")
    parser.add_argument("--source-branch", required=True)
    parser.add_argument("--target-branch", required=True)
    parser.add_argument("--title", required=True)
    parser.add_argument("--description-file", required=True)
    args = parser.parse_args()

    if not args.fork.startswith("issue/"):
        die(f"--fork must be an issue fork (issue/<project>-<nid>), got {args.fork}")
    try:
        with open(args.description_file, encoding="utf-8") as handle:
            description = handle.read()
    except OSError as error:
        die(f"Cannot read --description-file: {error}")
    if "AI disclosure" not in description:
        die("Description has no AI disclosure — append the block from drupalorg-comment-format.")

    fork = api(f"/projects/{encode(args.fork)}")
    target = api(f"/projects/{encode(args.target)}")

    existing = api(
        f"/projects/{target['id']}/merge_requests"
        f"?state=opened&source_branch={urllib.parse.quote(args.source_branch)}"
    )
    for mr in existing:
        if mr.get("source_project_id") == fork["id"]:
            print(f"Existing MR: {mr['web_url']}")
            return

    mr = api(
        f"/projects/{fork['id']}/merge_requests",
        "-F", f"target_project_id={target['id']}",
        "-f", f"source_branch={args.source_branch}",
        "-f", f"target_branch={args.target_branch}",
        "-f", f"title={args.title}",
        "-f", f"description={description}",
        "-F", "remove_source_branch=true",
        method="POST",
    )
    print(f"Created MR: {mr.get('web_url') or mr}")


if __name__ == "__main__":
    main()
