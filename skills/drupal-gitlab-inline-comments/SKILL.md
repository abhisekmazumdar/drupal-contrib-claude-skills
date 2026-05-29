---
name: drupal-gitlab-inline-comments
description: >
  Use this skill whenever the user wants to fetch or display review comments from
  git.drupalcode.org — either inline diff threads on a Merge Request, or top-level
  comments on a migrated-queue Issue / Work Item. Triggers when the user pastes a
  Drupal GitLab MR or work-item URL, says "show me the MR comments", "what are the
  inline comments", "pull the review comments", "fetch the issue comments", or anything
  about reading/displaying reviewer or commenter feedback. Always use this skill before
  answering any question about what reviewers or commenters said on a Drupal MR or
  migrated issue.
---

# GitLab Comments — Drupal (git.drupalcode.org)

Two scripts live here; pick by what the URL points at:

| Input | Script | Endpoint | Output |
|---|---|---|---|
| `…/-/merge_requests/<iid>` | `fetch.py` | `/discussions` | Inline diff threads, grouped by file/line, open vs resolved |
| `…/-/work_items/<iid>` or `…/-/issues/<iid>` | `fetch_issue_notes.py` | `/notes` | Chronological top-level comments on a migrated issue queue |

Both share the same auth resolution (env → glab → keychain → anonymous) and use the
GitLab REST API directly so the output is stable and parseable.

---

## MR inline review comments

Run for any Drupal GitLab MR URL:

```bash
python3 .claude/skills/drupal-gitlab-inline-comments/fetch.py <MR_URL>
```

Example:

```bash
python3 .claude/skills/drupal-gitlab-inline-comments/fetch.py \
  https://git.drupalcode.org/project/ai/-/merge_requests/899
```

The script handles everything: token auth, URL parsing, pagination, filtering, and
formatted output (open threads first, then resolved, sorted by file and line).

---

## Issue / Work Item comments (migrated queues)

For Drupal.org projects whose issue queue has moved to GitLab work items
(e.g. `project/ai`), use the notes fetcher:

```bash
python3 .claude/skills/drupal-gitlab-inline-comments/fetch_issue_notes.py <URL_OR_REF>
```

Accepts:

- `https://git.drupalcode.org/project/<name>/-/work_items/<nid>`
- `https://git.drupalcode.org/project/<name>/-/issues/<nid>`
- Shorthand: `project/<name>#<nid>` (e.g. `project/ai#3577170`)

Example:

```bash
python3 .claude/skills/drupal-gitlab-inline-comments/fetch_issue_notes.py \
  https://git.drupalcode.org/project/ai/-/work_items/3577170
```

System notes (assignments, label changes, status updates) are filtered out.
Output is sorted oldest → newest so the conversation reads naturally.

---

## Authentication

Both scripts read credentials in this order: `GITLAB_TOKEN` env → `glab` CLI
config → macOS Keychain (legacy) → anonymous (public projects only).

One-time setup: `glab auth login --hostname git.drupalcode.org` — after that
both scripts pick up the token automatically. For full installation and
authentication details, see the **`drupal-gitlab`** skill.

---

## Output format

```
X open threads, Y resolved — Z files affected

[OPEN] #<note_id> @<author>
  File: <path>:<line>
  Comment: <body>
  Replies: <count> — last by @<username>: <preview>

--- RESOLVED ---

[RESOLVED] #<note_id> @<author>
  ...
```

- Open threads are listed first, sorted by file then line number.
- Resolved threads follow under a separator.
- System-generated notes (commit pushes, "changed this line") are filtered out automatically.
- Pagination is handled automatically (fetches all pages if >100 discussions).

---

## Notes

- **`new_line` can be null:** for comments on deleted lines, the script falls back to `old_line`.
- **`resolved` vs functionally addressed:** GitLab only marks a thread resolved when someone
  clicks "Resolve thread". Threads where a maintainer replied "changed this line in version X"
  will still show `[OPEN]`. Treat threads with a maintainer reply as functionally addressed
  even if not formally resolved.
- **Why `/discussions` over `/notes`:** The flat `/notes` endpoint lacks thread grouping and
  doesn't reliably exclude system notes. `/discussions` gives both.
