---
name: issue-record-update
description: >
  Append a timestamped session log entry to issues/<nid>/README.md, recording what was done in this session, human instructions given, decisions made, and any MRs or patches created. Use when the user says "update the issue record", "log what we did", "record this session", or at the end of any work session on a Drupal issue.
argument-hint: <nid>
---

# /issue-record-update

**Purpose:** Append a session log entry to the issue's persistent record.

**Usage:** `/issue-record-update <nid>` (also invoked automatically by
`drupal-issue-start` and `drupal-issue-agent` at the end of any session that
did something — code reviewed, changed, tested, or a comment/push attempted.
A pure read-only catchup with no action taken skips this; run it manually if
you want one logged anyway, or to add your own context to an entry already
logged.)

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

Read `issues/<nid>/README.md` to find the position of `## At a Glance`, `## Work Log`, and `## Notes` headings.

---

## Step 4 — Draft the log entry

Build this block:

```markdown
### Session: YYYY-MM-DD
**TL;DR:** <one sentence — what changed or was decided this session>

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
- <anything unresolved or deferred, as of this session>
  — OR —
- None.
```

Rules:
- `TL;DR` must be a single skimmable sentence — a future session (or a human) reading only the TL;DRs down the Work Log should get the shape of the issue's history without opening any entry in full.
- Be concrete — name files changed, tests fixed, PHPCS errors resolved, functions reviewed. Never write vague phrases like "worked on the issue."
- Human instructions must reflect what was actually said — do not reinterpret or sanitize.
- `Open items` is this session's historical record, not a running list — don't copy forward unresolved items from prior sessions' entries. The single current-and-still-relevant next step goes in `## At a Glance` instead (Step 5), not accumulated here session over session.

---

## Step 5 — Insert the entry and update cross-references

Insert the log entry immediately after the `## Work Log` heading and its following blank line, **before** any existing session entries. Most recent session is always first.

If the issue status changed this session (e.g. an MR was merged and issue is now Fixed), update the `**Status:**` line in the header, normalized to the fixed vocabulary `drupal-issue-start` uses (`Active`, `Needs review`, `Needs work`, `RTBC`, `Fixed`, `Closed`, `Postponed`, `Needs discussion`). Always refresh `**Last updated:**` to today, whether or not status changed.

If any related issues were discovered this session, append them to the `## Related Issues` section (never remove existing entries; add the heading if it doesn't exist yet). Format:
```
- #<nid> <title> — <one line on the relationship>
```

**Always overwrite `## At a Glance` in place** — this section is always a
snapshot of *now*, never append-only (unlike Work Log and Related Issues):
- If the RTBC-readiness verdict changed this session, update `**Verdict:**`
  and `**Current MR:**`. The fact that it changed still belongs in this
  session's log entry above (e.g. under "What was done": "Verdict moved
  from Needs work — missing test to RTBC-ready after adding the Kernel
  test").
- Always replace `**Next action:**` and `**Blocked on:**` with this
  session's current values, sourced only from what's true right now — never
  merge in leftover items from a previous session's `Open items`. If
  nothing is blocking, write "Nothing".

---

## Step 6 — Archive old entries once Work Log grows past 3 sessions

`drupal-issue-start` and `drupal-issue-catchup` read this README in full on
every visit, so an unbounded Work Log means every future session pays to
re-read the whole history even though it only needs the last one or two.

After inserting this session's entry, count the `### Session:` headings in
`## Work Log`. **If there are more than 3:** move every entry beyond the 3
most recent (i.e. everything from the 4th onward) out to
`issues/<nid>/history.md` — create that file if it doesn't exist yet, with a
one-line header (`# Issue <nid> — archived session history`). Insert the
moved entries at the **top** of `history.md`, most-recently-archived first,
keeping the same relative order they had in the Work Log. Leave exactly the
3 most recent entries in the README's `## Work Log`.

If this is the first time `history.md` is created for this issue, add a
one-line pointer right after the `## Work Log` heading in the README:
```
<!-- Older sessions archived to history.md — read it only when you
     genuinely need pre-<oldest-remaining-date> context, e.g. digging up
     why an old decision was made. Not part of the routine read. -->
```

Do not read `history.md` back in as part of this skill — writing to it is
the only thing that happens here.

---

## Step 7 — Confirm

Tell the user: "Session logged in `issues/<nid>/README.md`." If Step 6
archived anything, add: "Archived N older session(s) to
`issues/<nid>/history.md`."

---

