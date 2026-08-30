---
name: drupal-issue-start
description: >
  Use when the user wants to start, continue, or get oriented on a specific Drupal issue — whether they paste a drupal.org or GitLab issue URL, reference an issue by number (e.g. "issue 3234567"), or ask to pick up, review, or catch up on a named issue. Handles first visits and returning sessions alike: loads any prior work context, fetches the current issue state, and presents a structured summary before any action is taken. Trigger on: bare issue URLs, "work on issue N", "start on N", "continue on N", "what's needed for issue N", "get me up to speed on issue N".
argument-hint: <issue-url>
---

# /drupal-issue-start

**Purpose:** The single entry point for all Drupal contribution work. Always start here — never invoke `drupal-issue-agent` directly.

**Usage:** `/drupal-issue-start <url>`

---

## Non-negotiable rules

- The issue record at `issues/<nid>/README.md` is **always** read (and created if absent) **before** any other action.
- The structured report is **always** shown to the human **before** any work is proposed.
- **Work never begins until the human gives explicit direction.**
- After any session involving code or reviews, remind the human to run `/issue-record-update <nid>`.

---

## Phase 0 — Parse the URL

Extract `nid` and `project` from the URL:

| Pattern | nid | project | notes |
|---|---|---|---|
| `https://www.drupal.org/project/<name>/issues/<nid>` | trailing number | `<name>` | classic queue |
| `https://git.drupalcode.org/project/<name>/-/work_items/<nid>` | trailing number | `<name>` | set `is_migrated=true` |

If the URL cannot be parsed, ask the user for the issue number and project name separately.

---

## Phase 1 — Load issue record

```bash
ls issues/<nid>/README.md 2>/dev/null
```

**If the file exists:** Read it in full. Note:
- Issue title and current status from the header
- All prior session log entries (what was done, when, by whom)
- The Notes section (human-written — important context)
- Last MR/patch referenced

**If the file does not exist:** Note this as a first-time visit. The directory and README will be created after Phase 2.

## Phase 2 — Fetch live issue context

Run all applicable commands. For **non-migrated** issues:
```bash
drupalorg issue:show <nid> --with-comments --format=llm
drupalorg mr:list <nid> --format=llm
drupalorg issue:get-fork <nid> --format=llm
```

For **migrated** issues (`is_migrated=true`):
```bash
GITLAB_HOST=git.drupalcode.org glab issue view <nid> --repo project/<project>
python3 .claude/skills/drupal-gitlab-inline-comments/fetch_issue_notes.py project/<project>#<nid>
drupalorg mr:list <nid> --format=llm
drupalorg issue:get-fork <nid> --format=llm
```

`drupalorg mr:list` and `issue:get-fork` are unreliable for migrated issues (empty project segment in the API URL causes 404s or malformed output such as `remote_name: -<nid>`). If either errors or returns no usable MR/fork info, fall back to:
```bash
GITLAB_HOST=git.drupalcode.org glab mr list --repo project/<project> --search "<nid>"
```
This reliably returns the MR iid, branch, and target for migrated issues. Prefer its result over a malformed `drupalorg` output when the two disagree.

For any issue with existing MRs, also fetch pipeline status for the latest MR branch:
```bash
GITLAB_HOST=git.drupalcode.org glab ci status -b <branch> -R project/<project>
```

Extract: title, project, current status, **every** open MR (iid + branch + pipeline status — not just the first one returned), comment count + date of last comment, whether a fork exists.

Also fetch every inline reviewer thread and top-level comment on each open MR, not just the issue's own comment thread:
```bash
python3 .claude/skills/drupal-gitlab-inline-comments/fetch.py \
  https://git.drupalcode.org/project/<project>/-/merge_requests/<mr-iid>
GITLAB_HOST=git.drupalcode.org glab mr note list <mr-iid> --repo project/<project>
```
Run this for every open MR found, not only the one you expect to review — the multi-MR selection in Phase 2.5 depends on knowing each one's actual activity, not just its existence.

Also note any **related issues** mentioned in comments or the issue body (e.g. "depends on #X", "follow-up to #X", "duplicate of #X", "blocks #X"). These will be written to the `## Related Issues` section.

**Also check for backlinks from other local issue records** — this catches
relationships the live comment thread doesn't mention (e.g. another issue's
own notes already reference this one):
```bash
python3 .claude/skills/drupal-related-issues/find_related_issues.py <nid>
```
Note every referencing issue and the matched line — these feed into Phase 3
and Phase 4 alongside the comment-derived related issues.

---

## Phase 2.5 — Recon: automatic checkout and preliminary review

**Goal of this phase and everything downstream in this skill: help the human
move the issue toward a mergeable, RTBC-ready state — not to accumulate an
exhaustive list of findings.** Every review this skill produces ends with a
judgment call (RTBC-ready / close, with the specific gap / needs work, with
the specific gap / needs discussion), not an open-ended checklist. Cosmetic
observations get mentioned once, not treated as blockers.

**If zero open MRs exist:** nothing to check out or review. Invoke
`drupal-repo-setup` in `recon` mode with no `<branch>` (clone-only, to confirm
the module is available for whoever implements next) and skip straight to the
"no review" case in Phase 4.

**If exactly one open MR exists:** that is the review target.

**If more than one open MR exists:** pick the most active one automatically
— prefer a passing pipeline over failing/pending, and break remaining ties by
most recent activity (latest commit or comment timestamp). Do not pause to
ask which one. Record the picked MR's reasoning and list the others by
iid/branch/status — these go in the Phase 4 report so the human can redirect
to a different MR if the auto-pick guessed wrong.

**Check out the picked MR automatically:**

```
Invoke agent: drupal-repo-setup
  project: <project>
  nid:     <nid>
  mode:    recon
  branch:  <picked MR's branch>
```

This runs without a pause for clone/checkout/fork-remote — only a missing
Composer dependency would pause it (per `drupal-repo-setup`'s own gates).
Capture its `## Setup issues` block verbatim — fork access, push access,
missing remote, DDEV not running, anything the human needs to know before
trusting the rest of this report goes here, unfiltered.

**Preliminary review (light — not the full correctness audit).** Once the
sub-agent confirms the branch is checked out:

```bash
git -C <module_dir> diff origin/<default-branch>...HEAD --stat
git -C <module_dir> diff origin/<default-branch>...HEAD
```

Read the diff and produce:
- **What it changes** — 2-4 sentences, plain language, what the code
  actually does (not a restatement of the issue title).
- **Verdict** — exactly one of:
  - `RTBC-ready` — pipeline passing, no open reviewer threads, diff matches
    the issue's resolution, tests present where the change warrants them
  - `Close — <named gap>` — e.g. "close — missing a test for the empty-input
    case" or "close — one open reviewer thread on line 42 unaddressed"
  - `Needs work — <named gap>` — e.g. "needs work — pipeline failing on
    PHPStan" or "needs work — diff doesn't address the reported bug"
  - `Needs discussion — <what's contested>` — the approach itself is
    disputed in the thread, not a code-quality question
- This is a **judgment call to orient the human**, not the exhaustive A7
  checklist `drupal-issue-agent` runs after approval — do not run PHPStan/PHPUnit
  here, do not enumerate every style nitpick. If something looks wrong,
  name it once; don't pad the verdict with a list.

If the diff is large enough that a light read genuinely can't support a
verdict, say so plainly ("diff too large for a preliminary read — verdict
deferred to full review") rather than guessing.

---

## Phase 3 — Create or update the issue record

**If `issues/<nid>/README.md` does NOT exist:**

```bash
mkdir -p issues/<nid>/screenshots issues/<nid>/comments
```

Write `issues/<nid>/README.md`:

```markdown
# Issue: <title>
- **URL:** <full URL as provided>
- **Project:** <project machine name>
- **Issue Number:** <nid>
- **Status:** <current status>
- **First seen:** <today YYYY-MM-DD>

## Issue Summary
<3-5 sentences: what is broken or missing, why it matters, current state of discussion,
what kind of fix is being proposed. Concrete and factual — no vague filler.>

## Key Context
<!-- Overwritten in place each session, like Review Status — a snapshot of
     what a human needs to know right now, not a history. This is the
     persisted version of the Phase 4 chat report, so a future session (or
     drupal-issue-catchup) doesn't have to re-fetch live state to reconstruct
     it. Bullet points, plain language — see "Writing the record" below. -->
- **MRs:** <iid, branch, pipeline status — one bullet per open MR>
- **Setup issues:** <verbatim from drupal-repo-setup's recon block, or "None">
- **Latest discussion:** <1-2 sentences on the most recent comment thread>

## Review Status
<!-- Reflects the CURRENT state only — overwritten in place each session,
     never appended to. issue-record-update logs the fact that it changed
     in that session's Work Log entry; this section itself stays a snapshot. -->
- **Verdict:** <RTBC-ready | Close — <gap> | Needs work — <gap> | Needs discussion — <topic> | No MR yet>
- **As of:** <MR !<iid> @ <short-sha> | "no MR"> (<today YYYY-MM-DD>)

## Related Issues
<!-- Cross-references to issues that touch the same code, depend on this fix, or are
     otherwise connected. Updated by AI when discovered; also human-editable.
     Format: - #<nid> <title> — <one line on the relationship> -->

## Work Log

## Notes
<!-- Human-editable. Add context, decisions, and reminders here.
     This section is never overwritten by the AI. -->
```

**If `issues/<nid>/README.md` already exists:**

- Update the `**Status:**` line in the header if the status has changed.
- Add any newly discovered related issues to the `## Related Issues` section (append only — never remove existing entries).
- Never touch the Work Log or Notes sections.

**Always overwrite `## Review Status` in place** with the verdict from Phase
2.5 (or "No MR yet" if there's nothing to review) — this section is a
snapshot of *now*, not a history; that's what the Work Log is for.

**Always overwrite `## Key Context` in place** the same way, with the MR
list, setup issues, and latest-discussion summary gathered in Phase 2.

### Writing the record

Write `## Issue Summary` and `## Key Context` as short, clean bullet points a
human can skim in a few seconds — not paragraphs. If the `technical-writing`
skill is installed, use it to structure these sections; then run an `unslop`
pass (same pattern `drupalorg-comment-format` uses) before writing the file,
to strip AI-writing tells. If either skill isn't installed,
apply the same discipline manually: short sentences, concrete nouns, no
filler ("leverages", "robust", "comprehensive").

Add an entry to `## Related Issues` for every issue the backlink scan found
that isn't already listed, whether the record is new or existing:
```
- #<other-nid> <other-title> — referenced by #<other-nid>'s own record: "<matched line, trimmed>"
```

Also check: if related issues were found (from comments or the backlink scan) and they have their own record at `issues/<related-nid>/README.md`, read those too and surface any relevant context in the report.

---

## Phase 4 — Present the structured report

Present this in full. Do not skip sections.

```
## Issue <nid>: <title>
- **URL:** <full URL>
- **Project:** <project> (<classic Drupal.org | GitLab work items>)
- **Status:** <current status>
- **Record:** issues/<nid>/README.md (<first seen date | "first visit — just created">)

---

### Prior Work (from record)

<If first visit: "No prior work recorded — this is the first session on this issue.">

<If prior sessions: one bullet per session — date, what was done, any open MRs from that session.>

<If Notes has content: reproduce it verbatim here.>

---

### Current State (live)

**MRs found:** <count>

<For each MR:>
- MR !<iid>: branch `<branch>`, pipeline <PASSING|FAILING|PENDING|n/a>
  <If FAILING: "Pipeline is FAILING — likely needs attention before review.">
  <Mark exactly one as "— checked out and reviewed below" when count > 1; the rest get "not checked out — say the word to switch to this one instead.">

**Issue comment activity:** <N> total comments, last comment: <date>
<1-2 sentences summarising the latest discussion thread.>

---

### Setup issues

<Verbatim from `drupal-repo-setup`'s `## Setup issues` block in Phase 2.5 —
fork/push access, missing remote, DDEV not running, clone failures. This is
what the human needs to know before trusting anything below. If it reported
"None": "None — clone, dependencies, and fork remote all set up cleanly.">

---

### Preliminary review

<If no MR exists: "No MR yet — nothing to review. See Recommendation below.">

<If an MR was checked out in Phase 2.5:>
**Verdict: <RTBC-ready | Close — <gap> | Needs work — <gap> | Needs discussion — <topic>>**

<2-4 sentence plain-language description of what the diff actually does.>

<If the verdict names a gap, state it again here as the single concrete
thing standing between this MR and RTBC — not a list of everything that
could theoretically be improved.>

---

### Related Issues

<List every entry now in the `## Related Issues` section, both the ones
found in comments and the ones found by the backlink scan — label the
backlink-scan ones explicitly so it's clear where they came from:>
- #<nid> <title> — <relationship, from comments>
- #<nid> <title> — found via backlink scan: referenced by #<nid>'s own record: "<matched line>"

<If neither source found anything: "No related issues found — neither in the comment thread nor in other local issue records.">

---

### What has been done (by anyone)

<3-8 bullet points based on comments + MR existence>

---

### What still needs to be done — path to RTBC

<If verdict is RTBC-ready: "Nothing — this looks ready. Consider marking it
RTBC on Drupal.org (I'll only do this if you tell me to; it's a queue-state
change like any other write here).">

<Otherwise: the named gap from the verdict above, restated as a concrete
action — e.g. "Add a Kernel test covering the empty-input case" not "improve
test coverage." 1-3 items, not a general audit.>

---

### Recommendation

**<exactly one of the four below, in bold, with 1-2 sentences of justification>**

- **Continue existing MR** — an open MR exists and the discussion supports finishing it
- **Implement fresh** — no MR exists, or the existing work is stale/abandoned per the comments
- **Needs discussion — do not implement yet** — requirements are contested or ambiguous in the thread
- **Do not touch** — status is RTBC or Fixed; code changes now would disrupt the queue. Only review or testing feedback is appropriate unless the human explicitly overrides.

Base this on status, MR state, the comment thread, and the Phase 2.5
preliminary verdict — the diff itself was already read in Phase 2.5, so this
recommendation should reflect what's actually in the MR, not just its title
or metadata. The full A1-A9 correctness audit still only happens in
`drupal-issue-agent` after the human approves proceeding.

---

### Suggested next steps

<2-5 concrete numbered options specific to the current state, aimed at
reaching RTBC as directly as possible — not a menu of every theoretically
possible action>
1. Fix the named gap in the existing MR !<iid> — <gap from verdict>
2. Implement the fix — no MR exists yet
3. Re-roll against the latest branch — branch is behind
4. Post a review comment endorsing RTBC — verdict is RTBC-ready
5. Track this issue for later — no action needed now

---

**What would you like to do?**
I will not start any work until you tell me.
```

**[HARD STOP]** Wait for the human to reply. Do not invoke any other skill, do not analyze code, do not propose a plan.

---

## Phase 5 — Follow human direction

Once the human replies, delegate to the appropriate agent or skill:

| Human says | Action |
|---|---|
| "review the MR" / "do a code review" / "work on it" / "implement" / "fix it" | Invoke `drupal-issue-agent` with `<nid>` and the loaded context |
| "test it" / "run the tests" / "verify in the browser" / "test locally" / "test this locally" / "run tests locally" | Invoke `drupal-issue-agent`'s Phase T flow: run local PHPUnit first (per the trigger's own local-testing intent), then proactively offer the `drupal-e2e-tester` browser e2e layer as a follow-up rather than waiting for a separate ask |
| "catch me up" / "what's new" / "what happened" | Invoke `drupal-issue-catchup` with `<nid>` |
| "continue" / "pick up where we left off" | Re-read the Work Log, brief human on last session, ask what to do next |
| "just track it" / "come back later" | Confirm record is saved, no further action |
| "add a note" | Append to the Notes section of the README |
| "this is related to #X" | Add the cross-reference to the `## Related Issues` section |
| Specific instructions | Follow them, using the appropriate skills |

Pass `<nid>`, `<project>`, `is_migrated`, MR iids, the full issue record content, and — if Phase 2.5 ran a recon checkout — the resolved `<module_dir>` and `<branch>` it already set up, plus the diff already read, so `drupal-issue-agent` does not have to re-fetch or re-checkout anything.

### Relaying agent pauses

Delegated agents run as sub-agents and **cannot talk to the user directly mid-run**.
When a delegated agent's run ends with a report starting with
`[PAUSE — awaiting user decision]`:

1. Relay the report to the user **verbatim** — do not summarize it, do not answer
   its question yourself.
2. Wait for the user's reply.
3. Resume the same agent with the user's reply — or, if the agent cannot be
   resumed, re-invoke it passing the pause report, the user's decision, and the
   issue record so it continues from that exact step.

Never proceed past an agent's pause on the user's behalf, and never treat a pause
report as the end of the work — the loop is only finished when the agent's final
message is not a pause.

---

## Phase 6 — After work

**If the session did something** — code was reviewed, changed, or pushed; a
comment was drafted; tests were run — invoke `/issue-record-update <nid>`
automatically at the end of the session. It appends the log entry (Steps 1-6
of that skill), then confirms:

```
Session logged in issues/<nid>/README.md.
```

**If the session was a pure catchup or read-only browse** — nothing was
changed, tested, drafted, or pushed — skip logging. Do not create a log
entry that just says "reviewed the issue" with nothing else in it; that adds
noise, not signal, to the Work Log.

The human can still run `/issue-record-update <nid>` manually any time
(e.g. to add their own context to an entry already logged, or to log a
session this rule skipped) — automatic logging replaces the reminder, not
the human's ability to trigger or annotate it themselves.
