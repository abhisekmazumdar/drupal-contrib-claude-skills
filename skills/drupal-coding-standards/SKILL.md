---
name: drupal-coding-standards
description: >
  Run Drupal coding standards checks (PHPCS) and auto-fix (PHPCBF) on a file or directory, matching exactly what the Drupal CI pipeline runs, plus the CI's CSpell, ESLint, and Stylelint jobs locally via ci_lint.py. Also covers PHP-compatibility review for Drupal 11.x (deprecations, PHP attributes, PHPUnit upgrades, PHP 8.4 compat) via references/php-changes.md. Use when the user asks to check coding standards, fix CS violations, run phpcs, cspell, eslint, or stylelint, fix a spelling/lint pipeline failure, review PHP compatibility, or before committing or pushing contribution work.
argument-hint: "[path]"
---

# /drupal-coding-standards

**Purpose:** Run Drupal coding standards checks (PHPCS) and auto-fix (PHPCBF) on a file
or directory, matching exactly what the Drupal CI pipeline runs. Also the place to check
Drupal 11.x PHP-compatibility concerns (deprecations, PHP attributes, PHPUnit upgrades,
PHP 8.4 compat) — see "PHP compatibility review" below.

**Usage:**
```
/drupal-coding-standards [path]
```

**Examples:**
```
/drupal-coding-standards web/modules/contrib/ai_agents
/drupal-coding-standards src/Plugin/MyPlugin.php
```

If no path is provided, ask the user which module or file to check.

---

## Environment

- **Runtime:** `ddev exec` — always run PHPCS and PHPCBF inside the DDEV container so the PHP version matches CI exactly
- **PHPCS binary:** `ddev exec php vendor/bin/phpcs`
- **PHPCBF binary:** `ddev exec php vendor/bin/phpcbf`
- **Standard:** use the module's own `phpcs.xml` when present (authoritative — matches CI exactly); fall back to `--standard=Drupal` only if no config file exists
- **Extensions fallback:** `php,module,inc,install,test,profile,theme,info,engine,yml`
- **Paths inside ddev:** `ddev exec` runs from `/var/www/html` (the Drupal root). Always pass paths **relative to the Drupal root** (e.g. `web/modules/contrib/foo`), never absolute host paths.

---

## Instructions

### Step 0: Detect the Drupal root and derive the relative target path (REQUIRED — do this first, every time)

The skill is global and works across multiple projects. Never hardcode a path.
Find the Drupal root by locating `vendor/bin/phpcs`. First walk UP from the
current working directory (handles standard single-root projects), then check
for a `drupal/` subdirectory one level down (handles workbench/monorepo layouts
where the Drupal install lives in a `drupal/` subfolder):

```bash
# Walk up from cwd
DRUPAL_ROOT=""
dir=$(pwd)
while [ "$dir" != "/" ]; do
  [ -f "$dir/vendor/bin/phpcs" ] && DRUPAL_ROOT="$dir" && break
  dir=$(dirname "$dir")
done

# Fallback: check for a drupal/ subdirectory (workbench/monorepo layout)
if [ -z "$DRUPAL_ROOT" ]; then
  dir=$(pwd)
  while [ "$dir" != "/" ]; do
    [ -f "$dir/drupal/vendor/bin/phpcs" ] && DRUPAL_ROOT="$dir/drupal" && break
    dir=$(dirname "$dir")
  done
fi
```

If `DRUPAL_ROOT` is still empty, report: "Cannot find vendor/bin/phpcs. Make
sure Composer dependencies are installed in your Drupal project root." and stop.

Store the result as `DRUPAL_ROOT`. Derive the **relative path** for use inside ddev:
```bash
REL_PATH="${TARGET_PATH#$DRUPAL_ROOT/}"
```

All `ddev exec` commands must be run from `$DRUPAL_ROOT` on the host (so ddev maps it to `/var/www/html`). Pass `$REL_PATH` to PHPCS/PHPCBF — never pass host absolute paths.

### Step 1: Resolve the target path and locate the phpcs config

- Resolve the target path (absolute, or relative to `DRUPAL_ROOT`).
- If no path was provided, ask: "Which module or file should I check?"
- Confirm the resolved path exists before proceeding.

**Locate the phpcs config** — walk up from the target path toward `DRUPAL_ROOT`
and look for `phpcs.xml` or `phpcs.xml.dist` (in that order):

```bash
# Find the nearest phpcs config from target upward to DRUPAL_ROOT
find_phpcs_config() {
  local d="$1"
  while [ "$d" != "/" ] && [ "$d" != "$DRUPAL_ROOT" ]; do
    [ -f "$d/phpcs.xml" ] && echo "$d/phpcs.xml" && return
    [ -f "$d/phpcs.xml.dist" ] && echo "$d/phpcs.xml.dist" && return
    d=$(dirname "$d")
  done
  # check root too
  [ -f "$DRUPAL_ROOT/phpcs.xml" ] && echo "$DRUPAL_ROOT/phpcs.xml" && return
}
PHPCS_CONFIG=$(find_phpcs_config "<resolved-path>")
```

If `PHPCS_CONFIG` is found, use `--standard="$PHPCS_CONFIG"`.
If not, use `--standard=Drupal --extensions=php,module,inc,install,test,profile,theme,info,engine,yml`.

This is critical — for example, `web/modules/contrib/ai/phpcs.xml` includes both
`Drupal` and `DrupalPractice`, which is what the AI module CI pipeline enforces.
Running `--standard=Drupal` alone would miss DrupalPractice violations.

### Step 2: Run PHPCBF (auto-fix)

```bash
cd "$DRUPAL_ROOT" && \
  ddev exec php vendor/bin/phpcbf --standard="$PHPCS_CONFIG" "$REL_PATH"
# or if no config found:
  ddev exec php vendor/bin/phpcbf --standard=Drupal --extensions=php,module,inc,install,test,profile,theme,info,engine,yml "$REL_PATH"
```

- Report how many files were fixed and how many violations remain.
- Exit code 0 = nothing to fix. Exit code 1 = fixed some files (success, continue).
- Exit code 2+ = real error, stop and report.

### Step 3: Run PHPCS (report remaining violations)

```bash
cd "$DRUPAL_ROOT" && \
  ddev exec php vendor/bin/phpcs --standard="$PHPCS_CONFIG" "$REL_PATH"
# or if no config found:
  ddev exec php vendor/bin/phpcs --standard=Drupal --extensions=php,module,inc,install,test,profile,theme,info,engine,yml "$REL_PATH"
```

- Exit 0: report "No violations found. Pipeline will pass."
- Exit 1: show the full report grouped by file. For each violation note:
  - File path and line number
  - Error or warning message
  - `[x]` = auto-fixable (PHPCBF should have caught it — re-run Step 2 if seen)
  - No marker = must be fixed manually

**Note:** `ddev exec` prints a red `Failed to execute command... exit status 1` line when PHPCS exits 1. This is cosmetic — `ddev exec` forwards the subprocess exit code to the host. The actual PHPCS violation report is printed above that line; read it there.

### Step 4: Fix remaining violations manually

For violations PHPCBF could not fix, use the Edit tool:

- **Line too long:** Shorten docblock text, or break code lines using Drupal multi-line style.
- **Missing docblock:** Add a Drupal-style docblock with short description.
- **Wrong indentation:** Drupal uses 2 spaces, not 4.
- **PHPUnit PHP attributes** (`#[CoversClass]` etc.): Replace with `@covers`, `@group`
  docblock annotations (Drupal 10 uses PHPUnit 9 which does not support PHP attributes).

After manual fixes, re-run Step 3 to confirm clean.

### Step 5: Report outcome

Summarise:
- Drupal root detected
- Files checked
- Violations auto-fixed by PHPCBF
- Violations manually fixed
- Final PHPCS exit code (0 = pipeline will pass)

---

## CSpell, ESLint, Stylelint (the CI-only jobs)

Run this before any push that changes code, comments, JS, CSS, or YAML. These
three jobs used to run only in CI, so one unrecognized word in a docblock
("hardcodeable", "upserts", "desync") or one CSS property out of order cost
a push, a red pipeline, and a second push.

`ci_lint.py` (next to this `SKILL.md`) runs them the way Drupal's
gitlab_templates do: the module's own `.gitlab-ci.yml` variables (`SKIP_*`,
`_CSPELL_WORDS`, `_CSPELL_IGNORE_PATHS`, `_*_EXTRA`, …), the cspell config
gitlab_templates' `prepare-cspell.php` builds (ported into the script, so
nothing is downloaded or executed from outside), core's
ESLint/Stylelint/Prettier configs, and CI's exact commands, run inside the
DDEV web container with core's `node_modules`. It forces a `ddev mutagen
sync` before each job, so a file saved a second ago is what gets checked.
The temporary files it needs (core config links, `.cspell_ignore_ci-lint.json`)
are created only if absent and removed afterwards, even on Ctrl-C.

**By default it checks only what the push changes**, so it takes seconds:
files that differ from the base (committed or not) plus untracked ones. Each
job runs only when there are files for it, so a PHP-only change runs cspell
alone. Pass the MR's target branch as the base. Without `--base` it falls
back to the branch's upstream (so only unpushed work), then `origin/HEAD`.

```bash
python3 "<skills-root>/drupal-coding-standards/ci_lint.py" <module-dir> --base origin/<target-branch>
# the whole module, like CI (slow on modules with large bundled JS):
python3 "<skills-root>/drupal-coding-standards/ci_lint.py" <module-dir> --all
# one job, or a job the module's .gitlab-ci.yml skips:
python3 "<skills-root>/drupal-coding-standards/ci_lint.py" <module-dir> --base origin/<target-branch> --only stylelint --include-skipped
```

Pass the module's host path (e.g. `<webroot>/modules/contrib/<project>`). It
finds the DDEV root and webroot itself.

- **Exit 0:** every job that CI would run passed. Jobs the module skips
  (`SKIP_ESLINT: 1`) show as SKIP, same as CI.
- **Exit 1:** a job failed. The output is the tool's own, same as in the
  pipeline log. Fix and re-run.
  - **cspell:** a real misspelling → use American English. A real
    word the dictionaries lack (a project or API term) → add it to the
    module's `.cspell-project-words.txt` (or the `_CSPELL_DICTIONARY` file),
    one per line, the way that project already does. Don't add the word just
    to silence a typo, and don't pick one fix for the human when it's ambiguous:
    say which and why.
  - **eslint/stylelint:** most failures are auto-fixable. Run the same tool with
    `--fix` only after reporting what it will change.
- **Exit 3:** core's `node_modules` aren't installed. CI runs `yarn install`
  in core before these jobs. Locally that's a one-time install that adds
  `<webroot>/core/node_modules` (several hundred MB, no tracked file changes).
  It's a dependency install, so ask first, then run the command the script
  prints and re-run. It survives `ddev stop`/`start`; a Composer update that
  replaces core removes it, and the script says so again.
- **Exit 2:** environment problem (no DDEV, no webroot, no merge base with
  the base ref).
  Report it. Don't skip silently: say the check didn't run, so the human
  knows CI is the first place it will.

`--dry-run` prints the commands and temp files without running or creating
anything.

Untracked files count as changed, since they're usually about to be added.
One you won't commit gets checked locally but never in CI, which only sees
the pushed tree.

A changed CSS file deeper than one folder (`modules/foo/css/x.css`) isn't
linted: CI's unquoted `./**/*.css` glob only reaches one folder deep, so CI
doesn't lint it either. The script says when that happens.

---

## PHP compatibility review

When the user asks about PHP compatibility, deprecations, PHP attributes, PHPUnit
upgrades, OOP hooks, fibers, or whether code will pass Drupal 11 CI on PHP-version
grounds (as opposed to a style/PHPCS violation), read `references/php-changes.md`
(resolve relative to this installed `SKILL.md`) and apply its checklist. This is a
lookup, not part of the standard PHPCS/PHPCBF run above — consult it only for that
specific PHP-compatibility question.

---

## Notes

- Never use `--standard=PEAR`, `--standard=PSR2`, or no standard — produces false errors.
- If PHPCS keeps looping on the same error after a fix attempt, stop and show the user
  the remaining violations rather than retrying indefinitely.
- Warnings about `version`, `project`, and `datestamp` keys in `.info.yml` files are injected by the drupal.org packaging script and are not real violations. They will always appear on local Composer-managed installs and can be ignored — CI does not fail on them.
