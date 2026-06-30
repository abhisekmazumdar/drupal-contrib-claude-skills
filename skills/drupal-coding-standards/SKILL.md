---
name: drupal-coding-standards
description: >
  Run Drupal coding standards checks (PHPCS) and auto-fix (PHPCBF) on a file or directory, matching exactly what the Drupal CI pipeline runs. Use when the user asks to check coding standards, fix CS violations, run phpcs, or before committing contribution work.
argument-hint: "[path]"
---

# /drupal-coding-standards

**Purpose:** Run Drupal coding standards checks (PHPCS) and auto-fix (PHPCBF) on a file
or directory, matching exactly what the Drupal CI pipeline runs.

**Usage:**
```
/drupal-coding-standards [path]
```

**Examples:**
```
/drupal-coding-standards web/modules/contrib/ai_agents/modules/ai_agents_views/src
/drupal-coding-standards web/modules/contrib/ai_agents
/drupal-coding-standards web/modules/contrib/ai/src
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

## Key Drupal standards (most common violations)

| Violation | Fix |
|-----------|-----|
| `Drupal.Files.LineLength.TooLong` | Shorten docblock text or break code across lines |
| `Drupal.Commenting.DocComment` | Ensure docblock has short description, proper tags |
| `Drupal.Commenting.FunctionComment` | Add `@param` and `@return` tags |
| PHPUnit PHP attributes | Replace with docblock annotations |

---

## Notes

- Never use `--standard=PEAR`, `--standard=PSR2`, or no standard — produces false errors.
- Do NOT hardcode `--standard=Drupal` without checking for a `phpcs.xml` first. Many modules (e.g. `ai`) include `DrupalPractice` in their config; missing it means missing violations the CI will catch.
- Always run via `ddev exec php vendor/bin/phpcs` — the container PHP version matches CI; host PHP may not.
- PHPCBF exit code 1 = "files were fixed" (not an error). Only 2+ is a real failure.
- If PHPCS keeps looping on the same error after a fix attempt, stop and show the user
  the remaining violations rather than retrying indefinitely.
- Warnings about `version`, `project`, and `datestamp` keys in `.info.yml` files are injected by the drupal.org packaging script and are not real violations. They will always appear on local Composer-managed installs and can be ignored — CI does not fail on them.
