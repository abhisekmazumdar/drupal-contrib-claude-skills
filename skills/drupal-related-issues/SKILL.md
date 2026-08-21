---
name: drupal-related-issues
description: >
  Scan the local issues/ directory for mentions of a given issue number in
  OTHER issues' records — catches backlinks that a one-directional read of
  the current issue's own comments would miss (e.g. issue A's Notes already
  say "blocked by #12345" before #12345's own record has ever heard of A).
  Use whenever an issue's context is being loaded or refreshed (issue start,
  catch-up) to keep the ## Related Issues section complete in both
  directions, not just what the current issue's own comment thread mentions.
---

# drupal-related-issues

One script: `find_related_issues.py`. Pure standard library, no dependencies.

```bash
python3 .claude/skills/drupal-related-issues/find_related_issues.py <nid>
```

Scans every `issues/<other-nid>/*.md` file (recursively) except the target
issue's own directory, looking for `<nid>` as a standalone number — matches
`#<nid>`, a bare mention, or `<nid>` inside a URL, but never a substring of a
longer number.

## Output

Default is human-readable, grouped by the referencing issue:

```
Found #3612345 mentioned in 2 other issue record(s):

## Issue 3600001: Add plugin type for X
  issues/3600001/README.md:47: - #3612345 blocks this — needs the new plugin type from that issue

## Issue 3588120: Refactor shared service
  issues/3588120/README.md:12: **Notes:** Related to #3612345, same underlying service refactor
```

`No mentions of #<nid> found in any other issue record.` when nothing matches.

Pass `--json` for a structured array of `{nid, title, file, line_number,
line}` objects instead — useful when the result needs to be merged
programmatically rather than read directly.

## How to use the result

1. Run it as part of loading/refreshing an issue's context (alongside the
   existing live Drupal.org/GitLab fetch).
2. For every referencing issue not already listed in the current issue's own
   `## Related Issues` section, append it:
   ```
   - #<other-nid> <other-title> — mentioned by #<other-nid>'s record: "<matched line, trimmed>"
   ```
3. Surface the same list in whatever report is being presented to the human
   — don't silently fold it into the file without saying so.

This only searches local records — it says nothing about issues that
reference the target on Drupal.org/GitLab itself but have never had
`/drupal-issue-start` run against them locally. That's a known blind spot,
not a bug: this script is a cheap local cross-check, not a replacement for
reading the live issue thread.
