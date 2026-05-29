---
name: drupal-work-on-issue
description: >
  Agentic workflow for contributing to a Drupal.org issue via GitLab MR. Orchestrates
  fork verification, directory alignment, remote setup, branch checkout, and the
  fix/push/pipeline loop.
---

# /drupal-work-on-issue

**Purpose:** Agentic workflow for contributing to a Drupal.org issue via GitLab MR.

**Usage:** `/drupal-work-on-issue <nid>`

---

## Instructions

When the user invokes `/drupal-work-on-issue <nid>`, execute the following workflow. Pause at
each checkpoint marked **[PAUSE]** — present findings and wait for the user to confirm
before proceeding.

---

### Step 1: Fetch issue and fork details

Run both commands to gather context:

```bash
drupalorg issue:show <nid> --format=llm
drupalorg issue:get-fork <nid> --format=llm
```

**Migrated issue queue fallback:** if `issue:show` returns an empty stub
(`<issue_id>` blank and `<title>` blank), the project has moved its issue queue
to GitLab work items. Re-fetch from GitLab instead — the NID is the work-item
IID:

```bash
GITLAB_HOST=git.drupalcode.org glab issue view <nid> --repo project/<project>
GITLAB_HOST=git.drupalcode.org glab issue note list <nid> --repo project/<project>
```

Derive `<project>` from a URL the user pasted (`/project/<name>/...`) or from
the fork name in `issue:get-fork`. MR commands (`mr:list`, `mr:diff`, etc.)
still work for migrated projects.

Report to the user:
- Issue title, status, project machine name (note "migrated queue" if applicable)
- Whether a fork exists and which branches are available

**Directory detection:** Before prompting the user, read `CLAUDE.md` in the current directory.
If it documents the path to the `<project>` module or repository, `cd` there automatically
and skip the directory prompt. Only fall back to running `git remote get-url origin` and
asking the user if `CLAUDE.md` provides no guidance.

**Branch selection:** Count branches from the `issue:get-fork` output that match `<nid>-*`:
- **Exactly one match** → select it automatically; no prompt needed.
- **Multiple matches** → list them and ask the user which to check out.
- **No matches** → note that no branches exist yet and ask the user how to proceed
  (e.g. create a new branch from the upstream project default branch).

**[PAUSE]** Only pause here if **multiple branches exist** and the user must pick one,
or if no branches exist at all and a new branch is needed. For any other ambiguity,
proceed automatically.

---

### Step 2: Set up remote and check out the branch

> **Never `cd` into the module directory.** Run all git commands from the Drupal
> root using `git -C web/modules/contrib/<project> <cmd>`. The `drupalorg`
> commands are run from the Drupal root and do not need a directory change.

Execute the following **without asking for permission** — this is expected
autonomous behaviour when working on an issue:

**Non-migrated project (issue on drupal.org):**
```bash
drupalorg issue:setup-remote <nid>
```

Immediately after, check the remote URL and silently fix it to SSH if needed:
```bash
url=$(git -C web/modules/contrib/<project> remote get-url drupalorg 2>/dev/null)
if echo "$url" | grep -q "^https://"; then
  git -C web/modules/contrib/<project> remote set-url drupalorg \
    git@git.drupal.org:issue/<project>-<nid>.git
fi
```

Then check out:
```bash
drupalorg issue:checkout <nid> <branch>
```

**Migrated project (issue queue on GitLab work items):**
The fork is still at `issue/<project>-<nid>` on `git.drupalcode.org`.
`drupalorg issue:setup-remote` and `issue:checkout` still work — use the same
commands as above. Alternatively, if an MR exists:
```bash
GITLAB_HOST=git.drupalcode.org glab mr checkout <mr-iid> \
  --repo issue/<project>-<nid>
```

Report the branch that is now active, then proceed immediately to Step 3.

---

### Step 3: Inspect the current MR state

**Diff the branch first** to understand what has already been changed vs. what is still
missing. Determine the upstream default branch from the fork data (e.g. `main`, `10.3.x`),
then run:

```bash
git -C web/modules/contrib/<project> diff origin/<default-branch>...HEAD
```

Read this diff carefully before analysing the MR — it is the authoritative record of what
the branch already contains. Do not assume a file is unchanged without checking the diff.

```bash
drupalorg mr:list <nid> --format=llm
```

**If `mr:list` returns no MRs:**
- Report "No MR exists yet for this issue."
- Skip the MR inspection commands below.
- Proceed directly to the work loop (Step 4).
- After the first `git push`, create the MR non-interactively with `glab`
  (preferred when authenticated against `git.drupalcode.org`):
  ```bash
  glab mr create --fill --target-branch <default-branch> \
    --repo issue/<project>-<nid>
  ```
  `--fill` uses the latest commit message for the title/description. Otherwise,
  capture the GitLab MR-creation URL printed in the push output and surface it
  to the user. Then re-run `drupalorg mr:list <nid> --format=llm` to pick up
  the newly created MR IID before polling pipeline status.

**If one or more MRs exist**, for the relevant MR (confirm with user if multiple exist):

```bash
drupalorg mr:files <nid> <mr-iid>
drupalorg mr:diff <nid> <mr-iid>
drupalorg mr:status <nid> <mr-iid> --format=llm
```

Summarise:
- What the MR changes (files and diff summary)
- Current pipeline status (passing / failing / pending)
- If the pipeline is failing, fetch logs: `drupalorg mr:logs <nid> <mr-iid>`

**[PAUSE]** Present your analysis of the MR and the pipeline results, then ask:
"What would you like me to work on?"

---

### Step 4: Work loop

> **Never `cd` into the module directory.** Use `git -C web/modules/contrib/<project>`
> from the Drupal root for every git command.
>
> **Always ask before `git add`, `git commit`, `git push`** — these require explicit
> user approval.

Iterate until the pipeline is green or the user asks to stop:

1. Make the requested code changes.
2. If `vendor/bin/phpcs` is available, run it on the module directory and fix any violations
   before proceeding:
   ```bash
   php vendor/bin/phpcs --standard=web/modules/contrib/<project>/phpcs.xml \
     web/modules/contrib/<project>/src
   ```
   Do **not** stage or commit files while PHPCS reports errors. Skip this step if PHPCS is
   not installed.
3. Before committing, inspect the project's commit style:
   ```bash
   git -C web/modules/contrib/<project> log --oneline -5
   ```
   Match the observed style (e.g. conventional commits, `Issue #<nid> by <username>:`, etc.)
   rather than defaulting to any fixed template.
4. Stage only the files you actually modified (**requires user approval**):
   ```bash
   git -C web/modules/contrib/<project> add <specific-changed-files>
   ```
5. Commit using the inferred message style (**requires user approval**):
   ```bash
   git -C web/modules/contrib/<project> commit -m "<message matching project style>"
   ```
6. Push (**requires user approval**):
   ```bash
   git -C web/modules/contrib/<project> push
   ```
7. Poll pipeline — pipelines run on the upstream project repo, not the issue
   fork. Prefer `glab` (works for both migrated and non-migrated projects);
   fall back to `drupalorg` only for non-migrated projects:
   ```bash
   GITLAB_HOST=git.drupalcode.org glab ci status -b <branch> -R project/<project>
   # fallback (non-migrated projects only):
   drupalorg mr:status <nid> <mr-iid> --format=llm
   ```
8. If failing, stream the failing job trace, then fix:
   ```bash
   GITLAB_HOST=git.drupalcode.org glab ci trace -b <branch> -R project/<project>
   # fallback (non-migrated projects only):
   drupalorg mr:logs <nid> <mr-iid>
   ```

**[PAUSE]** After each push, report the pipeline outcome and ask whether to continue
or stop.

---

## Notes

- `issue:setup-remote` is idempotent — safe to re-run.
- `--format=llm` output is optimised for parsing; always use it when reading structured data.
- If the fork has no branches, the contributor has not pushed yet — discuss with the user
  before creating a new MR from the upstream project.
