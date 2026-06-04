---
name: issue-record-update
description: >
  Append a timestamped session log entry to issues/<nid>/README.md, recording what was
  done in this session, human instructions given, decisions made, and any MRs or patches
  created. Use when the user says "update the issue record", "log what we did", "record
  this session", or at the end of any work session on a Drupal issue.
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

---

## Step 3 — Read the current README

Read `issues/<nid>/README.md` to find the position of `## Work Log` and `## Notes` headings.

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
- Be concrete — name files changed, tests fixed, PHPCS errors resolved, functions reviewed
- Never write vague phrases like "worked on the issue" or "made some changes"
- Human instructions must reflect what was actually said — do not reinterpret or sanitize
- If the session was purely analysis, say so explicitly
- Date is today's date in YYYY-MM-DD

---

## Step 5 — Show draft and confirm

Show the human the draft log entry and ask: "Does this accurately capture the session? Any changes or additions?"

**[PAUSE]** Wait for confirmation before writing. If the human suggests changes, incorporate them and show again. Once they say "yes", "looks good", or similar — proceed.

---

## Step 6 — Insert the entry

Insert the log entry immediately after the `## Work Log` heading and its following blank line, **before** any existing session entries. Most recent session is always first.

If the issue status changed this session (e.g. an MR was merged and issue is now Fixed), also update the `**Status:**` line in the header.

---

## Step 7 — Confirm

Tell the user: "Session logged in `issues/<nid>/README.md`."

---

## Step 8 — Store session summary in mem0

After the README is confirmed, store a compact memory so future sessions can search for it:

```
add_memory(
  text="Issue <nid> (<project>) session <YYYY-MM-DD>: <1-2 sentence summary of what was done and what is still open>",
  user_id="<your-mem0-user-id>",
  app_id="{{DDEV_PROJECT}}",
  metadata={"type": "project", "issue_nid": "<nid>", "project": "<project>"}
)
```

Keep the text under 200 characters — focus on decisions made and open items, not raw activity. Do not store a memory if the session was purely context-loading with no work done.
