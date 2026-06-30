---
name: drupal-issue-reroll
description: >
  Rebase (reroll) a Drupal issue branch on the latest upstream branch, run PHPCS and PHPStan checks, and push the result. Use when an MR branch has fallen behind origin, when CI fails due to merge conflicts, or when a maintainer asks to reroll before review.
argument-hint: "<nid> [project]"
---

# /drupal-issue-reroll

**Purpose:** Rebase a Drupal issue branch on the latest upstream, verify it
passes local checks, and push. Equivalent to a manual `git rebase` + checks +
force-push but with conflict guidance and automatic quality gates.

**Usage:**
```
/drupal-issue-reroll <nid>
/drupal-issue-reroll <nid> <project>
```

**Examples:**
```
/drupal-issue-reroll 3478123
/drupal-issue-reroll 3478123 ai
```

If called without arguments, derive `<nid>` and `<project>` from the current
git branch name (`<nid>-*`) or ask the user.

---

## Environment

- All git operations use `git -C <module_path>` where `<module_path>` is detected in Step 0 — never `cd`, never hardcode the path
- PHPStan always runs via `ddev exec` from the module root (host PHP version differs)
- PHPCS uses the `drupal-coding-standards` skill
- Force-push uses `--force-with-lease` (safe — rejects if remote moved unexpectedly)
- Push remote is the issue fork remote named `<project>-<nid>` (e.g. `ai-3584951`) — **never** `drupalorg`

---

## Instructions

### Step 0: Resolve inputs

1. **Detect the module path** — never hardcode `web/modules/contrib/<project>`. Find it:
   ```bash
   find . -maxdepth 6 -type d -name "<project>" | grep "modules/contrib" | head -1
   ```
   Store as `MODULE_PATH` (e.g. `drupal/web/modules/contrib/ai`). Use this in all
   subsequent `git -C <MODULE_PATH>` commands.

2. If `<nid>` not provided, check the current branch name:
   ```bash
   git -C <MODULE_PATH> branch --show-current
   ```
   Extract the NID from the branch name (first numeric segment, e.g.
   `3478123-fix-provider-config` → `3478123`).

3. If `<project>` not provided, derive it from the branch name or the detected
   module path.

4. **Detect the push remote** — list remotes and find the one named `<project>-<nid>`:
   ```bash
   git -C <MODULE_PATH> remote -v | grep "<project>-<nid>"
   ```
   Store as `FORK_REMOTE` (e.g. `ai-3584951`). If not found, report:
   > "No fork remote named `<project>-<nid>` found. Available remotes:" (list them)
   > "Please run `/drupal-work-on-issue <nid>` to set up the fork remote first."
   and stop.

5. Confirm the working tree is clean before rebasing:
   ```bash
   git -C <MODULE_PATH> status --porcelain
   ```
   If there are uncommitted changes, stop and tell the user:
   > "There are uncommitted changes. Please stash or commit them first."

### Step 1: Fetch the latest upstream

```bash
git -C <MODULE_PATH> fetch origin
```

Detect the default branch:
```bash
git -C <MODULE_PATH> symbolic-ref refs/remotes/origin/HEAD \
  | sed 's|refs/remotes/origin/||'
```

Store as `DEFAULT_BRANCH`. Common values: `1.x`, `2.x`, `main`.

Report: "Fetched origin. Default branch is `<DEFAULT_BRANCH>`.
Current branch: `<current-branch>`. Rebasing onto `origin/<DEFAULT_BRANCH>`..."

### Step 2: Check if rebase is needed

```bash
git -C <MODULE_PATH> log \
  origin/<DEFAULT_BRANCH>..HEAD --oneline | wc -l  # commits ahead
git -C <MODULE_PATH> log \
  HEAD..origin/<DEFAULT_BRANCH> --oneline | wc -l  # commits behind
```

If the branch is 0 commits behind, report: "Branch is already up to date with
`origin/<DEFAULT_BRANCH>`. No rebase needed." and stop.

### Step 3: Rebase

```bash
git -C <MODULE_PATH> rebase origin/<DEFAULT_BRANCH>
```

**If rebase succeeds (exit 0):** proceed to Step 4.

**If conflicts (exit non-zero):**

1. Show the conflict list:
   ```bash
   git -C <MODULE_PATH> diff --name-only --diff-filter=U
   ```

2. Read each conflicted file in full. For every conflict — trivial or not — prepare a proposed resolution but **do not apply it yet**.

3. **[PAUSE]** Present the full conflict report and wait for approval before editing any file:

   ```
   ## Rebase Conflicts Found

   | File | Conflict type | Proposed resolution |
   |------|--------------|-------------------|
   | <file> | <e.g. whitespace / overlapping logic / both added lines> | <keep ours / keep theirs / merge — description> |

   I will not edit any files until you approve these resolutions.
   Should I proceed with the proposals above, or do you want to adjust any of them?
   ```

4. Only after the user approves, apply the resolutions using the Edit tool. After resolving all conflicts:
   ```bash
   git -C <MODULE_PATH> add <resolved-files>
   git -C <MODULE_PATH> rebase --continue
   ```

5. If the rebase still fails after resolution attempts, run:
   ```bash
   git -C <MODULE_PATH> rebase --abort
   ```
   And report: "Rebase aborted — conflicts require manual resolution. The
   branch is unchanged."

### Step 4: Run pre-push quality checks

Do not push until both pass.

**PHPCS:** Use the `drupal-coding-standards` skill on the module directory:
```
/drupal-coding-standards <MODULE_PATH>
```

**PHPStan:** Derive the ddev-internal path by stripping the project root prefix
from `MODULE_PATH` and prepending `/var/www/html/`:
```bash
ddev exec bash -c "cd /var/www/html/<ddev-relative-MODULE_PATH> && \
  phpstan analyse --configuration=phpstan.neon --memory-limit=256M 2>&1"
```
Skip if no `phpstan.neon` exists in the module root.

If either check fails, **do not auto-fix**. Instead, present the violations and wait for approval:

```
## Quality Check Failures

### PHPCS violations
<list of errors/warnings with file and line>

### PHPStan errors (if any)
<list>

Proposed fixes:
- <file>: <what PHPCBF will auto-fix or what manual edit is needed>

Shall I apply these fixes?
```

Only after the user approves, apply fixes (PHPCBF or Edit tool), re-run the check, and confirm it passes before proceeding. Do not push failing code.

### Step 5: Push

**Requires user approval before running.**

```bash
git -C <MODULE_PATH> push <FORK_REMOTE> <branch> --force-with-lease
```

Where `<FORK_REMOTE>` is the remote detected in Step 0 (e.g. `ai-3584951`) and
`<branch>` is the current branch name (e.g. `3584951-add-kernel-test-for`).

`--force-with-lease` is required after a rebase — it rewrites history. It
rejects the push if the remote has moved since the last fetch (safe guard
against overwriting someone else's push).

### Step 6: Report

```
## Reroll complete

- Rebased onto: origin/<DEFAULT_BRANCH>
- Commits carried over: <N>
- Conflicts resolved: <N> (or "none")
- PHPCS: clean
- PHPStan: clean (or "skipped — no phpstan.neon")
- Pushed: yes (force-with-lease)

Pipeline will start shortly. Monitor with:
  GITLAB_HOST=git.drupalcode.org glab ci status -b <branch> -R project/<project>
```

---

## Notes

- Always `--force-with-lease`, never bare `--force` — safer and communicates intent.
- If the module directory is not a git clone, pause and ask the user before invoking `drupal-clone-contrib` — cloning creates files on disk and requires explicit approval.
- Rerolling does NOT create a new MR — the existing MR updates automatically
  when the branch is pushed.
- After a reroll, post a short comment on the issue noting the reroll so
  reviewers know to re-check the diff.
