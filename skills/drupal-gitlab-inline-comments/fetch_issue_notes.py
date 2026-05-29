#!/usr/bin/env python3
"""
Fetch and display top-level comments (notes) on a GitLab issue / work item
on git.drupalcode.org. Used for Drupal.org projects whose issue queue has
migrated to GitLab work items (e.g. `project/ai`).

Usage:
    python3 fetch_issue_notes.py <URL_OR_REF>

Accepted inputs:
    - Work item URL:   https://git.drupalcode.org/project/<name>/-/work_items/<nid>
    - Legacy URL:      https://git.drupalcode.org/project/<name>/-/issues/<nid>
    - Shorthand ref:   project/<name>#<nid>          (e.g. project/ai#3577170)

Auth:
    Uses `glab` if installed and logged in to git.drupalcode.org.
    Falls back to GITLAB_TOKEN env var or anonymous access for public projects.

Output: chronological list of non-system notes. System notes (assignments,
label changes, status updates) are filtered out.
"""

import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request

BASE = "https://git.drupalcode.org"


def die(msg):
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(1)


def parse_input(arg):
    """Return (encoded_project_path, iid) from a URL or shorthand ref."""
    # Shorthand: project/<name>#<iid>
    m = re.match(r"([\w./-]+)#(\d+)$", arg.strip())
    if m:
        return m.group(1).replace("/", "%2F"), m.group(2)

    # URL: /-/work_items/<iid> or /-/issues/<iid>
    m = re.match(
        r"https?://git\.drupalcode\.org/(.+?)/-/(?:work_items|issues)/(\d+)",
        arg.rstrip("/"),
    )
    if not m:
        die(
            "Cannot parse input.\n"
            "Expected one of:\n"
            "  https://git.drupalcode.org/<project>/-/work_items/<nid>\n"
            "  https://git.drupalcode.org/<project>/-/issues/<nid>\n"
            "  project/<name>#<nid>"
        )
    return m.group(1).replace("/", "%2F"), m.group(2)


def get_token():
    """Prefer GITLAB_TOKEN env, then glab CLI config. Empty for anonymous."""
    token = os.environ.get("GITLAB_TOKEN", "")
    if token:
        return token

    try:
        result = subprocess.run(
            ["glab", "auth", "status", "--hostname", "git.drupalcode.org", "-t"],
            capture_output=True,
            text=True,
        )
        # Line format: "  ✓ Token found: <value>" (or older "Token: <value>").
        output = (result.stdout or "") + (result.stderr or "")
        match = re.search(r"Token(?:\s+found)?:\s*(\S+)", output)
        if match:
            value = match.group(1).strip()
            if value and value not in ("<no value>", "no value"):
                return value
    except FileNotFoundError:
        pass

    return ""


def fetch(url):
    token = get_token()
    req = urllib.request.Request(url)
    if token:
        req.add_header("PRIVATE-TOKEN", token)
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        if e.code == 401:
            die("401 Unauthorized — run `glab auth login -h git.drupalcode.org` or set GITLAB_TOKEN.")
        if e.code == 404:
            die(f"404 Not Found — check the project name and issue/work-item ID: {url}")
        die(f"HTTP {e.code} from GitLab API: {body[:300]}")


def fetch_all_notes(project, iid):
    notes = []
    page = 1
    while True:
        url = f"{BASE}/api/v4/projects/{project}/issues/{iid}/notes?per_page=100&page={page}&sort=asc"
        batch = fetch(url)
        if not isinstance(batch, list):
            die(f"Unexpected response: {batch}")
        notes.extend(batch)
        if len(batch) < 100:
            break
        page += 1
    return notes


def print_note(n):
    created = (n.get("created_at") or "")[:10] or "?"
    print(f"#{n['id']} @{n['author']['username']} ({created})")
    body = (n.get("body") or "").rstrip()
    if not body:
        print("  <empty>")
    else:
        for line in body.splitlines():
            print(f"  {line}")
    print()


def main():
    if len(sys.argv) < 2:
        die("Usage: python3 fetch_issue_notes.py <URL_OR_REF>")

    project, iid = parse_input(sys.argv[1])
    all_notes = fetch_all_notes(project, iid)

    real = [n for n in all_notes if not n.get("system")]
    system_count = len(all_notes) - len(real)

    print(
        f"{len(real)} comments ({system_count} system notes filtered) — "
        f"project={project.replace('%2F', '/')} issue={iid}\n"
    )
    for n in real:
        print_note(n)


if __name__ == "__main__":
    main()
