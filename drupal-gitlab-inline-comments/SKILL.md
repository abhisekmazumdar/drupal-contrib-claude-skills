---
name: drupal-gitlab-inline-comments
description: >
  Use this skill whenever the user wants to fetch or display inline review comments from a
  GitLab Merge Request on git.drupalcode.org. Triggers when the user pastes a Drupal GitLab
  MR URL, says "show me the MR comments", "what are the inline comments", "pull the review
  comments", or anything about reading/displaying reviewer feedback from a Drupal MR.
  Always use this skill before answering any question about what reviewers said in an MR.
---

# GitLab MR Inline Comments — Drupal (git.drupalcode.org)

Fetches inline diff comments from a Drupal GitLab MR using the GitLab REST API.
Uses the `/discussions` endpoint to preserve thread structure (parent comment + replies).

---

## How to use

Run the bundled script, passing the full MR URL:

```bash
python3 .claude/skills/drupal-gitlab-inline-comments/fetch.py <MR_URL>
```

Example:

```bash
python3 .claude/skills/drupal-gitlab-inline-comments/fetch.py \
  https://git.drupalcode.org/project/ai/-/merge_requests/899
```

The script handles everything: token auth, URL parsing, pagination, filtering, and formatted output.

---

## Token

The script reads `GITLAB_TOKEN` from the environment. Drupal projects are mostly public so
it works without a token. It will stop with a clear error on 401.

To generate a token (needed for private projects):
`https://git.drupalcode.org/-/user_settings/personal_access_tokens` — `read_api` scope is enough.

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
