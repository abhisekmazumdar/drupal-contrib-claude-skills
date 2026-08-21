#!/usr/bin/env python3
"""
Scan the local issues/ directory for mentions of a given issue number in
*other* issues' records.

This catches backlinks that a one-directional scan misses: issue A's own
record may not yet have "#12345" in its Related Issues section, but issue
12345's record (Notes, session log, summary) might already reference A.
Without this, that relationship is invisible until someone happens to read
issue 12345 directly.

Usage:
    python3 find_related_issues.py <nid> [--issues-dir issues] [--json]

Output (default): human-readable list of matches, grouped by referencing
issue, with file, line number, and the matched line's text.

Output (--json): a JSON array of
    {"nid": "<referencing nid>", "title": "<referencing issue title>",
     "file": "<path>", "line_number": <int>, "line": "<text>"}
"""

import argparse
import json
import os
import re
import sys

TITLE_RE = re.compile(r"^#\s*Issue:\s*(.+?)\s*$")


def find_title(readme_path):
    """Best-effort extraction of the '# Issue: <title>' header line."""
    try:
        with open(readme_path, "r", encoding="utf-8", errors="replace") as f:
            for line in f:
                m = TITLE_RE.match(line.strip())
                if m:
                    return m.group(1)
    except OSError:
        pass
    return None


def scan(nid, issues_dir):
    """Return a list of match dicts for every mention of `nid` outside its
    own issue directory."""
    # Match the nid as a standalone number — not preceded or followed by
    # another digit — so "3612345" doesn't false-match inside "36123456"
    # but does match "#3612345", ".../issues/3612345", or a bare mention.
    pattern = re.compile(r"(?<!\d)" + re.escape(nid) + r"(?!\d)")

    matches = []
    if not os.path.isdir(issues_dir):
        return matches

    own_dir = os.path.join(issues_dir, nid)
    for entry in sorted(os.listdir(issues_dir)):
        entry_path = os.path.join(issues_dir, entry)
        if not os.path.isdir(entry_path):
            continue
        if os.path.abspath(entry_path) == os.path.abspath(own_dir):
            continue  # skip the issue's own directory

        for root, _dirs, files in os.walk(entry_path):
            for fname in files:
                if not fname.endswith(".md"):
                    continue
                fpath = os.path.join(root, fname)
                try:
                    with open(fpath, "r", encoding="utf-8", errors="replace") as f:
                        lines = f.readlines()
                except OSError:
                    continue

                for i, line in enumerate(lines, start=1):
                    if pattern.search(line):
                        matches.append({
                            "nid": entry,
                            "title": find_title(os.path.join(entry_path, "README.md")),
                            "file": fpath,
                            "line_number": i,
                            "line": line.strip(),
                        })
    return matches


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("nid", help="The issue number to search for mentions of")
    parser.add_argument("--issues-dir", default="issues",
                         help="Path to the issues directory (default: issues)")
    parser.add_argument("--json", action="store_true",
                         help="Output as JSON instead of human-readable text")
    args = parser.parse_args()

    matches = scan(args.nid, args.issues_dir)

    if args.json:
        print(json.dumps(matches, indent=2))
        return

    if not matches:
        print(f"No mentions of #{args.nid} found in any other issue record.")
        return

    by_nid = {}
    for m in matches:
        by_nid.setdefault(m["nid"], []).append(m)

    total_issues = len(by_nid)
    print(f"Found #{args.nid} mentioned in {total_issues} other issue "
          f"record(s):\n")

    for other_nid in sorted(by_nid, key=lambda n: (len(n), n)):
        group = by_nid[other_nid]
        title = group[0]["title"] or "(title unknown)"
        print(f"## Issue {other_nid}: {title}")
        for m in group:
            print(f"  {m['file']}:{m['line_number']}: {m['line']}")
        print()


if __name__ == "__main__":
    main()
