---
name: drupal-issue-start
description: >
  PRIMARY ENTRY POINT for all Drupal issue work. Given a Drupal.org or GitLab issue URL,
  loads any prior work context from issues/<nid>/README.md, fetches live issue state via
  CLI tools and Playwright, generates a structured status report, and waits for human
  direction before doing anything. Use whenever the user pastes a Drupal issue URL,
  says "work on issue <nid>", "start on <nid>", "review issue <url>", "continue on <nid>",
  or just drops an issue link.
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

For any issue with existing MRs, also fetch pipeline status for the latest MR branch:
```bash
GITLAB_HOST=git.drupalcode.org glab ci status -b <branch> -R project/<project>
```

Extract: title, project, current status, all MRs (iid + branch + pipeline status), comment count + date of last comment, whether a fork exists.

---

## Phase 3 — Create or update the issue record

**If `issues/<nid>/README.md` does NOT exist:**

```bash
mkdir -p issues/<nid>/screenshots
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

## Work Log

## Notes
<!-- Human-editable. Add context, decisions, and reminders here.
     This section is never overwritten by the AI. -->
```

**If `issues/<nid>/README.md` already exists:**

Only update the `**Status:**` line in the header if the status has changed. Never touch the Work Log or Notes sections.

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

**Issue comment activity:** <N> total comments, last comment: <date>
<1-2 sentences summarising the latest discussion thread.>

---

### What has been done (by anyone)

<3-8 bullet points based on comments + MR existence>

---

### What still needs to be done

<3-8 bullet points based on status + comment analysis>

---

### Suggested next steps

<2-5 concrete numbered options specific to the current state>
1. Review the existing MR !<iid> — pipeline is <status>
2. Implement the fix — no MR exists yet
3. Re-roll against the latest branch — branch is behind
4. Post a review comment — analysis is complete
5. Track this issue for later — no action needed now

---

**What would you like to do?**
I will not start any work until you tell me.
```

**[HARD STOP]** Wait for the human to reply. Do not invoke any other skill, do not analyze code, do not propose a plan.

---

## Phase 5 — Follow human direction

Once the human replies, delegate to the appropriate skill or agent:

| Human says | Action |
|---|---|
| "review the MR" / "do a code review" | Invoke `drupal-review-issue` with `<nid>` |
| "work on it" / "implement" / "fix it" | Invoke `drupal-work-on-issue` with `<nid>` |
| "continue" / "pick up where we left off" | Re-read the Work Log, brief human on last session, ask what to do next |
| "just track it" / "come back later" | Confirm record is saved, no further action |
| "add a note" | Append to the Notes section of the README |
| Specific instructions | Follow them, using the appropriate skills |

Pass the `<nid>` and relevant context from the issue record to any delegated skill so it doesn't have to re-fetch everything.

---

## Phase 6 — After work

After any session involving code changes, reviews, or pushes, remind the human:

```
Session complete. Run `/issue-record-update <nid>` to log what was done.
```

Do not call `issue-record-update` automatically — the human triggers it so they can add their own context.
