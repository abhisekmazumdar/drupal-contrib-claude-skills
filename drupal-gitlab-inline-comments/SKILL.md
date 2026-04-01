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

## Token setup (one-time, macOS)

Drupal projects are mostly public — no token needed. For private projects or to avoid 401s,
store your token in macOS Keychain so it is never exposed to the shell environment or to AI.

**1. Generate a token**

Go to `https://git.drupalcode.org/-/user_settings/personal_access_tokens` and create one
with `read_api` scope.

**2. Store it in macOS Keychain**

```bash
security add-generic-password -s "drupal-gitlab" -a "token" -w "YOUR_TOKEN_HERE"
```

The script calls `security find-generic-password` at runtime to retrieve it. The token never
touches an environment variable and is never visible in the conversation.

**3. Add a PreToolUse hook to your project's `.claude/settings.json`**

This is the belt-and-suspenders layer: even if `GITLAB_TOKEN` is accidentally set in your
shell, the hook strips it before Claude runs the script — forcing keychain-only auth.

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "python3 -c \"import sys,json; d=json.load(sys.stdin); cmd=d.get('tool_input',{}).get('command',''); d.setdefault('tool_input',{})['command']='env -u GITLAB_TOKEN '+cmd if 'fetch.py' in cmd else cmd; print(json.dumps(d))\""
          }
        ]
      }
    ]
  }
}
```

If `.claude/settings.json` already exists in your project, merge the `hooks` block into it.

**Verify the keychain entry works**

```bash
security find-generic-password -s "drupal-gitlab" -a "token" -w
```

Should print your token. To remove it later:

```bash
security delete-generic-password -s "drupal-gitlab" -a "token"
```

**Fallback**

If `security` is unavailable (non-macOS CI, Linux), the script falls back to the
`GITLAB_TOKEN` environment variable automatically.

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
