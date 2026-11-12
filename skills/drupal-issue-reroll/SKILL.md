---
name: drupal-issue-reroll
description: >
  Rebase (reroll) a Drupal issue branch on the latest upstream branch, run PHPCS and PHPStan checks, and push the result. Use when an MR branch has fallen behind origin, when CI fails due to merge conflicts, or when a maintainer asks to reroll before review.
argument-hint: "<nid> [project]"
disable-model-invocation: true
---

# /drupal-issue-reroll

**Usage:**
```
/drupal-issue-reroll <nid>
/drupal-issue-reroll <nid> <project>
```

**Example:**
```
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
   > "Please run `/drupal-issue-start <url>` to set up the fork remote first."
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

2. Read each conflicted file in full. Before resolving, read the
   originating issue/MR behind **each side** of the conflict: the incoming
   upstream commit and the local branch's own commit (`git log -1 --format=%B
   <sha>` gives the issue number). A conflict that looks like a trivial line
   clash can hide two intentional, incompatible changes.

3. Resolve each conflict with the Edit tool and record it for the Step 6
   report — file, conflict type, resolution (keep ours / keep theirs / merge),
   and why:
   ```bash
   git -C <MODULE_PATH> add <resolved-files>
   git -C <MODULE_PATH> rebase --continue
   ```

4. **Stop instead of guessing** when the two sides are intentional,
   incompatible changes (both issues meant their behavior, and keeping one
   drops the other): `git -C <MODULE_PATH> rebase --abort`, then end with
   `[PAUSE — awaiting user decision]` naming the files, both issues, and the
   choice the human has to make. The branch is unchanged.

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

If either check fails, fix it (PHPCBF, or the Edit tool for what PHPCBF
can't fix), re-run the check, and record what changed for the Step 6 report.
If it still fails after that, stop and report it — do not push failing code.

### Step 5: Push

Push as soon as Step 4 passes — no separate approval.

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
- Conflicts resolved: <N> (or "none") — one line each: file, resolution, why
- Check fixes: <what PHPCBF/edits changed, or "none">
- PHPCS: clean
- PHPStan: clean (or "skipped — no phpstan.neon")
- Pushed: yes (force-with-lease)

Pipeline will start shortly. Monitor with (the branch was pushed to the issue
fork, so check there first — `-R project/<project>` will 404 since that
branch doesn't exist in the target project's own repo):
  GITLAB_HOST=git.drupalcode.org glab ci status -b <branch> -R issue/<project>-<nid>
```

---

## Notes

- Always `--force-with-lease`, never bare `--force` — safer and communicates intent.
- If the module directory is not a git clone, pause and ask the user before invoking `drupal-clone-contrib` — cloning creates files on disk and requires explicit approval.
- Rerolling does NOT create a new MR — the existing MR updates automatically
  when the branch is pushed.
- After a reroll, draft a short comment noting the reroll so reviewers know
  to re-check the diff — the user posts it, never you.
