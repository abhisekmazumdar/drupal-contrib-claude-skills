---
name: drupal-issue-reroll
description: >
  Rebase (reroll) a Drupal issue branch on the latest upstream branch, run
  PHPCS and PHPStan checks, and push the result. Use when an MR branch has
  fallen behind origin, when CI fails due to merge conflicts, or when a
  maintainer asks to reroll before review.
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

- All git operations use `git -C web/modules/contrib/<project>` — never `cd`
- PHPStan always runs via `ddev exec` from the module root (host PHP version differs)
- PHPCS uses the `drupal-coding-standards` skill
- Force-push uses `--force-with-lease` (safe — rejects if remote moved unexpectedly)

---

## Instructions

### Step 0: Resolve inputs

1. If `<nid>` not provided, check the current branch name:
   ```bash
   git -C web/modules/contrib/<project> branch --show-current
   ```
   Extract the NID from the branch name (first numeric segment, e.g.
   `3478123-fix-provider-config` → `3478123`).

2. If `<project>` not provided, find the module directory:
   ```bash
   find web/modules/contrib -maxdepth 1 -type d -name "<derived-from-branch>"
   ```
   Or check `CLAUDE.md` for documented paths.

3. Confirm the working tree is clean before rebasing:
   ```bash
   git -C web/modules/contrib/<project> status --porcelain
   ```
   If there are uncommitted changes, stop and tell the user:
   > "There are uncommitted changes. Please stash or commit them first."

### Step 1: Fetch the latest upstream

```bash
git -C web/modules/contrib/<project> fetch origin
```

Detect the default branch:
```bash
git -C web/modules/contrib/<project> symbolic-ref refs/remotes/origin/HEAD \
  | sed 's|refs/remotes/origin/||'
```

Store as `DEFAULT_BRANCH`. Common values: `1.x`, `2.x`, `main`.

Report: "Fetched origin. Default branch is `<DEFAULT_BRANCH>`.
Current branch: `<current-branch>`. Rebasing onto `origin/<DEFAULT_BRANCH>`..."

### Step 2: Check if rebase is needed

```bash
git -C web/modules/contrib/<project> log \
  origin/<DEFAULT_BRANCH>..HEAD --oneline | wc -l  # commits ahead
git -C web/modules/contrib/<project> log \
  HEAD..origin/<DEFAULT_BRANCH> --oneline | wc -l  # commits behind
```

If the branch is 0 commits behind, report: "Branch is already up to date with
`origin/<DEFAULT_BRANCH>`. No rebase needed." and stop.

### Step 3: Rebase

```bash
git -C web/modules/contrib/<project> rebase origin/<DEFAULT_BRANCH>
```

**If rebase succeeds (exit 0):** proceed to Step 4.

**If conflicts (exit non-zero):**

1. Show the conflict list:
   ```bash
   git -C web/modules/contrib/<project> diff --name-only --diff-filter=U
   ```

2. Read each conflicted file in full. For each, attempt to resolve if the
   conflict is trivial (e.g. both sides add/remove unrelated lines, or a
   whitespace-only conflict). Use the Edit tool to resolve.

3. For non-trivial conflicts (overlapping logic changes), show the conflict
   markers to the user and ask which side to keep.

4. After resolving all conflicts:
   ```bash
   git -C web/modules/contrib/<project> add <resolved-files>
   git -C web/modules/contrib/<project> rebase --continue
   ```

5. If the rebase still fails after resolution attempts, run:
   ```bash
   git -C web/modules/contrib/<project> rebase --abort
   ```
   And report: "Rebase aborted — conflicts require manual resolution. The
   branch is unchanged."

### Step 4: Run pre-push quality checks

Do not push until both pass.

**PHPCS:** Use the `drupal-coding-standards` skill on the module directory:
```
/drupal-coding-standards web/modules/contrib/<project>
```

**PHPStan:** Run from the module root via ddev (never host PHP):
```bash
ddev exec bash -c "cd /var/www/html/web/modules/contrib/<project> && \
  phpstan analyse --configuration=phpstan.neon --memory-limit=256M 2>&1"
```
Skip if no `phpstan.neon` exists in the module root.

If either check fails, fix the violations (using PHPCBF or Edit tool), then
re-run the check before proceeding. Do not push failing code.

### Step 5: Push

**Requires user approval before running.**

```bash
git -C web/modules/contrib/<project> push drupalorg HEAD --force-with-lease
```

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
- If the module directory is not a git clone, invoke `drupal-clone-contrib`
  skill automatically before proceeding.
- Rerolling does NOT create a new MR — the existing MR updates automatically
  when the branch is pushed.
- After a reroll, post a short comment on the issue noting the reroll so
  reviewers know to re-check the diff.
