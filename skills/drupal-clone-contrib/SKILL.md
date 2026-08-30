---
name: drupal-clone-contrib
description: >
  Use this skill whenever the user needs to git-clone a Drupal contributed module, theme, or recipe from drupal.org's git infrastructure (git.drupalcode.org / git.drupal.org) to work on it locally. The defining signal is direct git access to contrib source — to patch it, submit a merge request, fix a bug, test a patch, or work on an issue. Covers all phrasings: "clone", "grab", "fetch", "pull down", "set up locally", "get the source for". Works with any contrib project name (views, pathauto, search_api, ctools, token, etc.). Skip this skill for Composer installs, tarball downloads, or version updates — those don't involve cloning the git repo.
argument-hint: <project-name> [--branch=<branch>] [--type=module|theme|recipe]
disable-model-invocation: true
---

# /drupal-clone-contrib

**Purpose:** Clone a Drupal contributed module, theme, or recipe from `git.drupalcode.org`
into the correct local directory for contribution work.

**Usage:**
```
/drupal-clone-contrib <project-name> [--branch=<branch>] [--type=module|theme|recipe]
```

**Examples:**
```
/drupal-clone-contrib ai --branch=2.0.x
/drupal-clone-contrib gin --branch=6.x --type=theme
/drupal-clone-contrib eca_starterkit --branch=1.0.x --type=recipe
```

**Path references:** use the `Docroot` path from CLAUDE.md as `<webroot>` (e.g. `web` or `drupal/web`) and the Drupal project prefix as `<drupal-path>` (e.g. `` or `drupal/`).

---

## Arguments

The user invoked this with: $ARGUMENTS

Parse the arguments from the string above:
- First token with no `--` prefix → `<project-name>` (required)
- `--branch=<value>` → branch to clone (optional)
- `--type=<value>` → one of `module`, `theme`, `recipe` (optional)

---

## Instructions

### Step 1: Resolve missing arguments

**If `--type` was not provided**, check local dirs first:
```bash
ls <webroot>/modules/contrib/<project-name> 2>/dev/null && echo "module"
ls <webroot>/themes/contrib/<project-name> 2>/dev/null && echo "theme"
ls <drupal-path>recipes/<project-name> 2>/dev/null && echo "recipe"
```

If not found locally, fetch the project releases to infer the type:
```bash
drupalorg project:releases <project-name> --format=llm
```

Look for `type` in the release output. If still ambiguous, ask the user:
"Is `<project-name>` a module, theme, or recipe?"

**If `--branch` was not provided**, fetch available releases:
```bash
drupalorg project:releases <project-name> --format=llm
```

For contribution work, prefer the latest `x.x-dev` branch over a stable tag — dev
branches are where MRs are opened and patches apply. Look for branches ending in `-dev`
(e.g. `2.0.x-dev`, `1.x-dev`) and select the highest one. Only fall back to a stable
branch if no dev branch exists. If multiple plausible dev branches exist, list them and
ask the user which to use.

---

### Step 2: Determine the target directory

| Type    | Target directory                  |
|---------|-----------------------------------|
| module  | `<webroot>/modules/contrib/<project>`   |
| theme   | `<webroot>/themes/contrib/<project>`    |
| recipe  | `<drupal-path>recipes/<project>`           |

**Check for conflicts:**
- If the target directory already exists and is a git repository (`ls <target>/.git`),
  report: "Directory already exists as a git repo at `<target>`. Aborting to avoid overwrite."
  Ask the user whether to remove it and re-clone, or skip.
- If the target directory exists but is NOT a git repo (e.g. installed by Composer),
  warn: "A non-git copy exists at `<target>` (likely Composer-managed). Cloning here will
  replace it. Proceed?" Wait for confirmation before continuing.
- If the target directory does not exist, proceed directly.

Ensure the parent directory exists:
```bash
mkdir -p <webroot>/modules/contrib   # (or themes/contrib, recipes as appropriate)
```

---

### Step 3: Clone the repository

Always clone over **SSH**:

```bash
git clone --branch '<branch>' git@git.drupal.org:project/<project-name>.git <target-directory>
```

Example:
```bash
git clone --branch '2.0.x' git@git.drupal.org:project/ai.git <webroot>/modules/contrib/ai
```

---

### Step 4: Verify and report

After cloning, confirm success:
```bash
git -C <target-directory> log --oneline -3
git -C <target-directory> remote -v
```

Report to the user:
- Full path of the cloned directory
- Active branch
- Last 3 commits (to confirm the correct branch was checked out)
- Reminder: "Run `/drupal-issue-start <url>` to set up the issue fork remote and start
  contribution work."

---

## Notes

- This skill only clones the upstream project. To add an issue fork remote for pushing
  patches or MRs, use `/drupal-issue-start <url>` afterward — it delegates to the
  `drupal-repo-setup` agent, which runs `drupalorg issue:setup-remote` and
  `drupalorg issue:checkout` for you.
- If DDEV is in use, enable the module after cloning with `ddev drush en <project>`.
- Recipes are not modules — do not enable with Drush. Apply with
  `ddev drush recipe <drupal-path>recipes/<project>`.
