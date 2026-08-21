---
name: issue-record-update
description: >
  Append a timestamped session log entry to issues/<nid>/README.md, recording what was done in this session, human instructions given, decisions made, and any MRs or patches created. Use when the user says "update the issue record", "log what we did", "record this session", or at the end of any work session on a Drupal issue.
argument-hint: <nid>
---

# /issue-record-update

**Purpose:** Append a session log entry to the issue's persistent record.

**Usage:** `/issue-record-update <nid>`

---

## Step 1 — Verify the record exists

```bash
ls issues/<nid>/README.md
```

If it does not exist, tell the user: "No record found for issue `<nid>`. Run `/drupal-issue-start <url>` first to create it."

---

## Step 2 — Gather session context

From the current conversation, collect:
- What was actually done this session (code changes, reviews, analysis performed)
- Human instructions that were given (what the human asked for — verbatim or accurately paraphrased)
- Decisions made (e.g. "decided not to push — approach needs rethinking")
- MRs created or updated (include full URLs)
- Any Drupal.org comments drafted or posted
- Current pipeline status if a push happened
- What is still unresolved, blocked, or deferred to next session
- Any related issues discovered this session (e.g. referenced in comments, or the fix touched code owned by another issue)
- Whether this session's work changes the RTBC-readiness verdict (a fix landed, a thread got resolved, a pipeline flipped) — and if so, what the new verdict is

---

## Step 3 — Read the current README

Read `issues/<nid>/README.md` to find the position of `## Review Status`, `## Work Log`, and `## Notes` headings.

---

## Step 4 — Draft the log entry

Build this block:

```markdown
### Session: YYYY-MM-DD
**What was done:**
- <specific action 1>
- <specific action 2>

**Human instructions:**
- <what the human said to do>

**MRs/patches:**
- MR !<iid> created: <url>
  — OR —
- No MR activity this session.

**Open items:**
- <anything unresolved or deferred>
  — OR —
- None.
```

Rules:
- Be concrete — name files changed, tests fixed, PHPCS errors resolved, functions reviewed. Never write vague phrases like "worked on the issue."
- Human instructions must reflect what was actually said — do not reinterpret or sanitize.

---

## Step 5 — Insert the entry and update cross-references

Insert the log entry immediately after the `## Work Log` heading and its following blank line, **before** any existing session entries. Most recent session is always first.

If the issue status changed this session (e.g. an MR was merged and issue is now Fixed), also update the `**Status:**` line in the header.

If any related issues were discovered this session, append them to the `## Related Issues` section (never remove existing entries). Format:
```
- #<nid> <title> — <one line on the relationship>
```

If the RTBC-readiness verdict changed this session, **overwrite** `## Review
Status` in place with the new verdict and today's date — this section is
always a snapshot of *now*, never append-only (unlike Work Log and Related
Issues). The fact that it changed still belongs in this session's log entry
above (e.g. under "What was done": "Verdict moved from Needs work — missing
test to RTBC-ready after adding the Kernel test").

---

## Step 6 — Confirm

Tell the user: "Session logged in `issues/<nid>/README.md`."

---

