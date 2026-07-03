---
name: issue-record-update
description: >
  Write a full session report to issues/<nid>/reports/ recording everything the agent found and did this session, and append a short indexing entry to issues/<nid>/README.md that links to it. Use when the user says "update the issue record", "log what we did", "record this session", or automatically at the end of any agent session on a Drupal issue (see agent Session Logging sections).
argument-hint: <nid>
---

# /issue-record-update

**Purpose:** Record the full findings and actions of this session in a standalone report file, and index it in the issue's persistent record.

**Usage:** `/issue-record-update <nid>`

The **report** (`issues/<nid>/reports/<file>.md`) is the detailed, standalone account of this session — everything the agent found and did. The **README** (`issues/<nid>/README.md`) stays a short running index that a human can scan at a glance; each session gets one entry there that links to its report.

---

## Step 1 — Verify the record exists

```bash
ls issues/<nid>/README.md
```

If it does not exist, tell the user: "No record found for issue `<nid>`. Run `/drupal-issue-start <url>` first to create it."

```bash
mkdir -p issues/<nid>/reports
```

---

## Step 2 — Determine new vs. resumed

Read `issues/<nid>/README.md` and check the `## Work Log` section.

- No existing `### Session:` entries → this is the **first working session** on the issue → `new`
- One or more existing `### Session:` entries → this session picked up prior work → `resumed`

---

## Step 3 — Gather everything found and done this session

This report exists to capture **everything the agent found**, not just a summary. From the current conversation, collect in full detail:

- Every finding from analysis or review — file:line references, specific issues identified, root causes diagnosed
- Full reasoning behind decisions (not just the decision itself — why)
- Every code change made — file, what changed, why
- Every command run that produced meaningful output (pipeline checks, test runs, PHPCS/PHPStan results) and the result
- Human instructions given this session (verbatim or accurately paraphrased)
- MRs or patches created or updated — full URLs
- Drupal.org comments drafted or posted, in full
- Current pipeline status if a push happened
- What is still unresolved, blocked, or deferred to next session, and why
- Any related issues discovered this session

Be exhaustive here — this file is the detailed record; the README entry (Step 6) is the short pointer to it.

---

## Step 4 — Build the slug and filename

- `<slug>`: 3-6 word kebab-case description of the session's focus (e.g. `fix-phpcs-line-length`, `review-mr-14-security`)
- Filename: `issues/<nid>/reports/YYYY-MM-DD-<slug>-<new|resumed>.md` (date = today, `new`/`resumed` from Step 2)
- If a file for today with the same slug already exists (multiple sessions same day), append `-2`, `-3`, etc.

---

## Step 5 — Write the report file

```markdown
# Session Report — Issue <nid>: <title>
- **Date:** YYYY-MM-DD
- **Type:** New session | Resumed session
- **Related README:** ../README.md

## What was done
<Exhaustive account of every action taken this session — code changes,
reviews performed, commands run and their results, comments drafted.>

## Findings
<Every specific finding — file:line, diagnosis, root cause. This is the
"everything the agent found" section — do not compress into vague bullets.>

## Human instructions
<What the human asked for this session, verbatim or accurately paraphrased.>

## Decisions
<Decisions made and the reasoning behind each — e.g. "chose to reroll
before fixing because branch was 12 commits behind, to avoid re-basing
fix commits later.">

## MRs / patches
<Full URLs, or "No MR activity this session.">

## Pipeline status
<Status after any push, or "No push this session.">

## Open items
<Unresolved, blocked, or deferred items, and why — or "None.">

## Related issues discovered
<New cross-references found this session — or "None.">
```

Rules:
- Be concrete — name files changed, tests fixed, PHPCS errors resolved, functions reviewed
- Never write vague phrases like "worked on the issue" or "made some changes"
- Human instructions must reflect what was actually said — do not reinterpret or sanitize
- If the session was purely analysis, say so explicitly

---

## Step 6 — Insert the README index entry

Read `issues/<nid>/README.md` to find `## Work Log` and `## Notes`.

Build this short entry (the README stays a scannable index — the full detail lives in the report file from Step 5):

```markdown
### Session: YYYY-MM-DD
**Type:** New | Resumed
**Summary:** <1-2 sentence summary of what was done>
**Full report:** [reports/<filename>](reports/<filename>)
**MRs/patches:** MR !<iid> created: <url> — OR — No MR activity this session.
**Open items:** <one line> — OR — None.
```

Insert immediately after the `## Work Log` heading and its following blank line, **before** any existing session entries. Most recent session is always first.

If the issue status changed this session (e.g. an MR was merged and issue is now Fixed), also update the `**Status:**` line in the header.

If any related issues were discovered this session, append them to the `## Related Issues` section (never remove existing entries). Format:
```
- #<nid> <title> — <one line on the relationship>
```

---

## Step 7 — Confirm

Tell the user: "Session logged — full report at `issues/<nid>/reports/<filename>`, indexed in `issues/<nid>/README.md`."

---
