---
name: drupal-review-issue
description: >
  Perform a structured code review of a Drupal.org issue MR. Use when the user says
  "review this issue", "do a code review", "check MR <nid>", "review MR <url>", or
  wants to evaluate a contribution before posting feedback. Covers correctness,
  security, Drupal coding standards, tests, API changes, and deprecations. Always
  produces a checklist the user approves before any comment is drafted.
argument-hint: <nid> [<mr-iid>]
---

# /drupal-review-issue

**Purpose:** Structured code review of a Drupal.org issue MR. Produces a checklist
for your approval — nothing is posted until you confirm.

**Usage:**
```
/drupal-review-issue <nid> [<mr-iid>]
```

If `<mr-iid>` is omitted, the open MR is auto-detected from `drupalorg mr:list`.

---

## Instructions

### Step 1 — Gather context

Run all of these in parallel:

```bash
# Issue details
drupalorg issue:show <nid> --with-comments --format=llm

# List MRs (auto-detect iid if not provided)
drupalorg mr:list <nid> --format=llm

# Inline review comments already on the MR
python3 ~/.claude/skills/drupal-gitlab-inline-comments/fetch.py \
  https://git.drupalcode.org/project/<project>/-/merge_requests/<mr-iid>

# Full diff
drupalorg mr:diff <nid> <mr-iid> --format=llm

# Pipeline status
drupalorg mr:status <nid> <mr-iid> --format=llm
```

If the pipeline is failing, also fetch logs:
```bash
drupalorg mr:logs <nid> <mr-iid>
```

---

### Step 2 — Read the code locally

Check out the branch so you can read files in full context (not just the diff):

```bash
drupalorg issue:setup-remote <nid>
drupalorg issue:checkout <nid> <branch>
```

Then read the changed files. For each new class or interface, read the full file —
the diff alone misses context like missing interface implementations or incorrect
base classes.

---

### Step 3 — Run static analysis locally

From the Drupal site root:

```bash
# PHPCS against Drupal + DrupalPractice standards
vendor/bin/phpcs <module-path>

# PHPStan if configured
vendor/bin/phpstan analyse <module-path> 2>/dev/null | tail -30
```

Note every violation. Distinguish between:
- **Errors** (must fix before merge)
- **Warnings** (worth flagging, not blockers)

---

### Step 3b — Cross-reference issue comments vs inline MR threads (with chronology)

Both data sources are now available:
- **Issue comments** from `drupalorg issue:show --with-comments` — each has a `<created>` timestamp
- **Inline MR threads** from `fetch.py` — each now has a `created_at` date

Build a unified timeline by merging and sorting both by date. Then look for these patterns:

**Pattern 1: Issue comment with no follow-up inline thread**
An issue comment raises a concern about specific code, but no inline thread was ever
opened on that file/line, and no commit after that date touched it.
→ The author likely missed it. Flag as `MISSED`.

**Pattern 2: Inline thread with no issue comment acknowledgement**
An inline thread was opened and addressed in code, but the author never posted a comment
on the issue confirming it was fixed.
→ Maintainers reading only the issue page won't know it was resolved. Flag as `SILENT FIX`.

**Pattern 3: Issue comment came AFTER a fix commit**
A maintainer raised something in the issue, but a commit that addresses it was already
pushed before the comment was written.
→ The fix may have been coincidental or pre-emptive. Verify the commit actually addresses
the concern — don't assume it does just because it came first.

**Pattern 4: Inline thread opened AFTER an issue comment on the same topic**
The issue comment was picked up and turned into an inline review. This is the healthy
pattern — no action needed, just confirms the concern was tracked properly.

**Output format for this step:**
```
Timeline cross-reference:
- [MISSED]     Issue comment #N (@author, YYYY-MM-DD): "<summary>" — no inline thread or code change found after this date
- [SILENT FIX] Inline thread #ID (@author, YYYY-MM-DD): "<summary>" — fixed in code but not acknowledged in issue
- [VERIFIED]   Issue comment #N → Inline thread #ID → commit <sha>: properly tracked and addressed
```

---

### Step 4 — Build the review checklist

Work through each category. Mark each item as:
- `PASS` — looks correct
- `FAIL` — problem found, describe it
- `SKIP` — not applicable to this MR

**Correctness**
- [ ] Logic matches the stated goal in the issue description
- [ ] Edge cases handled (null values, empty arrays, missing config)
- [ ] No obvious runtime errors (uninitialized variables, wrong method calls)
- [ ] Entity/field operations follow Drupal patterns correctly
- [ ] Service dependencies injected properly (not instantiated with `new`)

**Security**
- [ ] No raw user input passed to queries (use entity query conditions, not raw SQL)
- [ ] Access checks present on routes and entity operations (`accessCheck(TRUE)`)
- [ ] No sensitive data logged or exposed in error messages
- [ ] File operations validated (existence, readable, fclose after fopen)

**Drupal API**
- [ ] Uses current API (no deprecated methods for the target branch)
- [ ] Schema/install changes have a corresponding `hook_update_N` or install file
- [ ] New entity types have proper annotation + interface + access handler
- [ ] Routes defined in `.routing.yml` match controller/form signatures
- [ ] Permissions defined in `.permissions.yml`

**Tests**
- [ ] New functionality has test coverage (Kernel or Functional)
- [ ] Test namespace is correct (`Drupal\Tests\<module>\Kernel`, capital T)
- [ ] Test uses `#[RunTestsInSeparateProcesses]` attribute (Drupal 11.3+)
- [ ] Mock/test providers match real provider interface

**Code quality**
- [ ] PHPCS passes with no errors
- [ ] PHPStan passes (or existing violations not worsened)
- [ ] No dead code or unused imports
- [ ] Doc comments present on all public methods

**Inline comments from reviewers**
- [ ] All open inline threads from previous reviewers addressed
- [ ] No regression on previously resolved points

---

### Step 5 — Present findings

**[PAUSE]** Present the completed checklist to the user with:

1. A one-line summary: "X items FAIL, Y items PASS, Z skipped"
2. Each FAIL with: file, line (if known), description, and suggested fix
3. Any open inline comment threads that are still unaddressed
4. Pipeline status

Ask: "Which of these would you like me to fix, and which do you want to handle yourself?"

---

### Step 6 — Fix loop (only for items the user approves)

For each approved fix:

1. Make the change
2. Run PHPCS on the changed file: `vendor/bin/phpcs <file>`
3. Stage only the changed files: `git add <specific files>`
4. Check commit style: `git log --oneline -5`
5. Commit matching the project style
6. After all fixes: `git push`
7. Poll pipeline: `drupalorg mr:status <nid> <mr-iid> --format=llm`
8. If failing: `drupalorg mr:logs <nid> <mr-iid>`

**[PAUSE]** After push, report pipeline outcome. Ask whether to continue or stop.

---

### Step 7 — Draft review comment (optional)

If the user wants to post a review comment on Drupal.org, use the
`drupalorg-comment-format` skill to draft it. Structure it as:

- Summary of what was reviewed
- List of issues found and fixed (if any)
- List of issues remaining for the author (if any)
- Your recommendation: Needs Work / Looks good to me
- AI declaration

**[PAUSE]** Always show the drafted comment and wait for the user to approve
before they post it.

---

## Notes

- **You stay in control.** This skill never posts, pushes, or changes status
  without an explicit pause and user confirmation at each step.
- **Checklist is a guide, not a script.** Use judgment — a one-line bug fix
  doesn't need the same scrutiny as a new entity type.
- **Inline comments from previous reviewers** are fetched via the
  `drupal-gitlab-inline-comments` script — always check these first to avoid
  re-raising already-addressed points.
- **Pipeline failures unrelated to the MR** (e.g. pre-existing test failures in
  other modules) should be noted but not treated as blockers for this MR.
