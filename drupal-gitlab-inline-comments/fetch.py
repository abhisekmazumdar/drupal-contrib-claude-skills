#!/usr/bin/env python3
"""
Fetch and display inline review comments from a Drupal GitLab MR.

Usage:
    python3 fetch.py <MR_URL>

Example:
    python3 fetch.py https://git.drupalcode.org/project/ai/-/merge_requests/899

Token:
    Set GITLAB_TOKEN env var for private projects. Public projects work without it.
"""

import json
import os
import re
import sys
import urllib.request
import urllib.error

BASE = "https://git.drupalcode.org"


def die(msg):
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(1)


def parse_url(url):
    """Extract URL-encoded project path and MR IID from a GitLab MR URL."""
    m = re.match(
        r"https://git\.drupalcode\.org/(.+?)/-/merge_requests/(\d+)", url.rstrip("/")
    )
    if not m:
        die(f"Cannot parse MR URL: {url}\nExpected: https://git.drupalcode.org/<project>/-/merge_requests/<iid>")
    project_encoded = m.group(1).replace("/", "%2F")
    mr_iid = m.group(2)
    return project_encoded, mr_iid


def fetch(url):
    token = os.environ.get("GITLAB_TOKEN", "")
    req = urllib.request.Request(url)
    if token:
        req.add_header("PRIVATE-TOKEN", token)
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        if e.code == 401:
            die("401 Unauthorized — set GITLAB_TOKEN env var with a valid personal access token.")
        die(f"HTTP {e.code} from GitLab API: {body[:300]}")


def fetch_all_discussions(project, mr_iid):
    """Fetch all discussion pages and return combined list."""
    discussions = []
    page = 1
    while True:
        url = f"{BASE}/api/v4/projects/{project}/merge_requests/{mr_iid}/discussions?per_page=100&page={page}"
        batch = fetch(url)
        if not isinstance(batch, list):
            die(f"Unexpected response from API: {batch}")
        discussions.extend(batch)
        if len(batch) < 100:
            break
        page += 1
    return discussions


def extract_threads(discussions):
    """Filter to inline diff threads only, skipping system notes."""
    threads = []
    for d in discussions:
        notes = d.get("notes", [])
        if not notes:
            continue
        root = notes[0]
        if root.get("system"):
            continue
        pos = root.get("position")
        if not pos:
            continue  # general MR comment, not inline
        file_path = pos.get("new_path") or pos.get("old_path", "")
        line = pos.get("new_line") or pos.get("old_line") or "?"
        resolved = d.get("resolved", False)
        replies = notes[1:]
        last_reply = replies[-1] if replies else None
        threads.append({
            "resolved": resolved,
            "id": root["id"],
            "author": root["author"]["username"],
            "created_at": root.get("created_at", ""),
            "file": file_path,
            "line": line,
            "body": root["body"],
            "reply_count": len(replies),
            "last_reply_author": last_reply["author"]["username"] if last_reply else None,
            "last_reply_body": last_reply["body"][:120] if last_reply else None,
            "last_reply_at": last_reply.get("created_at", "") if last_reply else None,
        })
    return threads


def sort_key(t):
    line = t["line"] if isinstance(t["line"], int) else 0
    return (t["file"], line)


def print_thread(t):
    status = "RESOLVED" if t["resolved"] else "OPEN"
    created = t["created_at"][:10] if t["created_at"] else "?"
    print(f"[{status}] #{t['id']} @{t['author']} ({created})")
    print(f"  File: {t['file']}:{t['line']}")
    # Print body, indenting continuation lines
    body_lines = t["body"].splitlines()
    print(f"  Comment: {body_lines[0]}")
    for bl in body_lines[1:]:
        print(f"           {bl}")
    if t["last_reply_author"]:
        last_at = t["last_reply_at"][:10] if t["last_reply_at"] else "?"
        print(f"  Replies: {t['reply_count']} — last by @{t['last_reply_author']} ({last_at}): {t['last_reply_body']}")
    print()


def main():
    if len(sys.argv) < 2:
        die("Usage: python3 fetch.py <MR_URL>")

    url = sys.argv[1]
    project, mr_iid = parse_url(url)

    discussions = fetch_all_discussions(project, mr_iid)
    threads = extract_threads(discussions)

    open_threads = sorted([t for t in threads if not t["resolved"]], key=sort_key)
    resolved_threads = sorted([t for t in threads if t["resolved"]], key=sort_key)
    files_affected = len(set(t["file"] for t in threads))

    print(f"{len(open_threads)} open threads, {len(resolved_threads)} resolved — {files_affected} files affected\n")

    for t in open_threads:
        print_thread(t)

    if resolved_threads:
        print("--- RESOLVED ---\n")
        for t in resolved_threads:
            print_thread(t)


if __name__ == "__main__":
    main()
