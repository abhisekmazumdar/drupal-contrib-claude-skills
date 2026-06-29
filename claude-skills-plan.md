# Plan: `claude-skills` — Generic CLI for Skill Package Management

## Context

`drupal-contrib-claude-skills` has a hardcoded `bin/setup.js` that asks Drupal-specific questions, renders templates, and copies skills/agents into `.claude/`. The goal is to extract this pattern into a **generic, reusable CLI tool** (`claude-skills`) so that anyone publishing a skill package can define their own questions and setup logic — like `composer require` but for Claude Code skills.

The new tool should:
- Let users run `npx claude-skills install drupal-contrib-skills` (or any package)
- Ask questions declared in the package's config (with auto-detection and smart defaults)
- Render templates and copy skills/agents into `.claude/`
- Track what's installed and remember answers (lockfile) so `update` is non-interactive

---

## What We're Building

### Two repos/packages

1. **`claude-skills`** — the new generic CLI (new npm package, separate repo)
2. **`drupal-contrib-claude-skills`** — gains a `claude-skills-config.json`, `bin/setup.js` gets a deprecation notice

---

## 1. `claude-skills` Package Structure

```
claude-skills/
  package.json                     name: "claude-skills", bin: "./bin/claude-skills.js"
  bin/
    claude-skills.js               CLI entry — parseArgs(), dispatch to commands
  lib/
    commands/
      install.js                   main flow (see §4)
      update.js                    re-fetch + apply with cached vars
      configure.js                 re-ask questions, re-apply (no re-fetch)
      list.js                      print table of installed packages
    core/
      config-loader.js             read + validate claude-skills-config.json
      questioner.js                interactive prompt engine (readline, data-driven)
      expression-evaluator.js      mini eval for "when" conditions and computed exprs
      template-engine.js           {{VAR}} string replacement (lifted from setup.js)
      applier.js                   copy skills/agents/templates to .claude/
      settings-merger.js           additive merge into .claude/settings.json
      resolver.js                  parse pkg arg → { sourceType, name, version }
      fetcher.js                   download/locate package, return local path
      manifest.js                  read/write claude-skills.json
      lockfile.js                  read/write claude-skills.lock.json
    detectors/
      index.js                     Map<name, DetectorFn>
      ddev-project-name.js         read .ddev/config.yaml → name field
      drupal-root.js               isDrupalRoot + findDrupalSubdir (lifted from setup.js)
      git-repo-name.js             git remote get-url origin → repo name
      node-package-name.js         package.json → name
      composer-package-name.js     composer.json → name
    utils/
      fs-utils.js                  copyFile, copyDirMerge (lifted from setup.js)
      logger.js                    coloured output, summary printer
```

**Zero external dependencies.** Uses only Node 18+ built-ins: `readline`, `fs`, `path`, `child_process`, `https`.

---

## 2. `claude-skills-config.json` Schema (in each skill package)

```jsonc
{
  "schemaVersion": "1",
  "name": "Drupal Contrib Skills",
  "description": "...",

  "questions": [
    {
      "name": "DRUPAL_SUBDIR",        // becomes the {{VAR}} key
      "type": "text",                 // "text" | "confirm" | "select"
      "label": "Where is your Drupal project?",
      "default": ".",
      "autoDetect": "drupal-root"     // named detector; result becomes pre-filled default
    },
    {
      "name": "DDEV_PROJECT",
      "type": "text",
      "label": "DDEV project name",
      "default": "{{DRUPAL_SUBDIR}}", // interpolate earlier answers
      "autoDetect": "ddev-project-name"
    },
    {
      "name": "SITE_URL",
      "type": "text",
      "label": "Site URL",
      "default": "https://{{DDEV_PROJECT}}.ddev.site"
    },
    {
      "name": "PHP_VERSION",   "type": "text", "label": "PHP version",    "default": "8.4" },
    { "name": "MARIADB_VERSION", "type": "text", "label": "MariaDB version", "default": "11.8" },
    {
      "name": "INSTALL_PLAYWRIGHT",
      "type": "confirm",
      "label": "Install Playwright skills?",
      "hint": "Requires: npm install -g @playwright/cli@latest",
      "default": false
    }
  ],

  "computed": [
    { "name": "DRUPAL_PATH",    "expr": "DRUPAL_SUBDIR === '.' ? '' : '{{DRUPAL_SUBDIR}}/'" },
    { "name": "DRUPAL_WEBROOT", "expr": "{{DRUPAL_PATH}}web" }
  ],

  "skills": [
    { "id": "ddev-expert" },
    { "id": "drupal-automated-testing" },
    // ... all unconditional skills ...
    { "id": "playwright-cli",          "when": "INSTALL_PLAYWRIGHT" },
    { "id": "issue-record-screenshot", "when": "INSTALL_PLAYWRIGHT" }
  ],

  "agents": [
    { "id": "drupal-issue-agent" },
    { "id": "drupal-issue-catchup" },
    { "id": "drupal-repo-setup" }
  ],

  "templates": [
    { "src": "templates/settings.json.template", "dest": ".claude/settings.json" },
    { "src": "templates/CLAUDE.md.template",     "dest": "CLAUDE.md" }
  ],

  "patches": [
    {
      "when": "INSTALL_PLAYWRIGHT",
      "type": "json-permissions",
      "file": ".claude/settings.json",
      "allow": ["mcp__plugin_playwright_playwright__*", "Bash(playwright-cli *)",
                "Skill(playwright-cli)", "Skill(playwright-cli:*)",
                "Skill(issue-record-screenshot)", "Skill(issue-record-screenshot:*)"]
    },
    {
      "when": "INSTALL_PLAYWRIGHT",
      "type": "frontmatter-list-append",
      "file": ".claude/agents/drupal-issue-agent.md",
      "field": "skills",
      "items": ["playwright-cli", "issue-record-screenshot"]
    }
  ],

  "postInstallMessage": "Open this project in Claude Code and run /drupal-issue-start <url>."
}
```

**`when` expressions:** bare var reference (`INSTALL_PLAYWRIGHT`), negation (`!X`), string equality (`X === '.'`), AND (`X && Y`). Evaluated by `expression-evaluator.js` — no `eval`, regex-based tokenizer.

**`autoDetect` field:** named key looked up in detector registry. Detector called with `{ cwd, vars }`, returns string or null. Non-null result becomes the pre-filled default (user still sees the prompt and can override).

---

## 3. Workspace Files

**`claude-skills.json`** (workspace manifest):
```json
{
  "schemaVersion": "1",
  "packages": {
    "drupal-contrib-skills": {
      "source": "drupal-contrib-skills",
      "sourceType": "npm",
      "version": "^1.0.0",
      "installedAt": "2026-06-25T10:30:00Z"
    }
  }
}
```

**`claude-skills.lock.json`** (lockfile — remembers answers):
```json
{
  "packages": {
    "drupal-contrib-skills": {
      "resolvedVersion": "1.2.3",
      "vars": {
        "DDEV_PROJECT": "my-project",
        "SITE_URL": "https://my-project.ddev.site",
        "PHP_VERSION": "8.4",
        "MARIADB_VERSION": "11.8",
        "INSTALL_PLAYWRIGHT": false
      },
      "computedVars": { "DRUPAL_PATH": "", "DRUPAL_WEBROOT": "web" }
    }
  }
}
```

---

## 4. Install Command Flow

```
claude-skills install <pkg>

1. resolver.resolve(pkg)      → sourceType + name + version range
2. fetcher.fetch(resolved)    → local path to package dir
3. config-loader.load(dir)    → validated config object
4. lockfile.load(cwd)         → cached vars from prior install (if any)
5. questioner.run(questions)  → for each question in order:
     a. evaluate "when" condition
     b. run autoDetect detector → detected value
     c. resolve "default" template string
     d. show prompt (pre-fill from lockfile if !--reconfigure)
     e. add answer to vars map
6. expression-evaluator        → resolve computed vars
7. applier.apply()            → skills + agents + templates (conditional on "when")
8. applier.applyPatches()     → json-permissions + frontmatter-list-append
9. manifest.save() + lockfile.save()
10. logger.summary()
```

`update` = steps 1–10 with locked vars as defaults  
`configure` = steps 3–10 (no re-fetch), pre-filled answers  
`list` = read manifest + lockfile, print table

---

## 5. Code to Lift from `bin/setup.js`

These functions move directly into `lib/utils/fs-utils.js` and `lib/core/template-engine.js` with minor signature changes (remove `CWD` global, pass `cwd` as arg):

- `renderTemplate(content, vars)` → `template-engine.js` (change: take content string not path)
- `copyFile(srcContent, destPath, log)` → `fs-utils.js` (unchanged)
- `copyDirMerge(src, dest, vars, log, skipDirs)` → `fs-utils.js` (unchanged)
- `isDrupalRoot(dir)` + `findDrupalSubdir(dir)` → `detectors/drupal-root.js`
- `readDdevProjectName(dir)` → `detectors/ddev-project-name.js`

---

## 6. Migration: `drupal-contrib-claude-skills`

1. Add `claude-skills-config.json` at repo root (full schema above)
2. Add `"claude-skills-config.json"` to `"files"` in `package.json`
3. Add deprecation notice at top of `bin/setup.js`:
   ```js
   console.warn('\nNote: setup.js is deprecated. Use: npx claude-skills install drupal-contrib-skills\n');
   ```
4. No structural changes to `skills/`, `agents/`, `templates/` — conventions already match

---

## 7. CLI Commands

```bash
npx claude-skills install drupal-contrib-skills    # from npm
npx claude-skills install github:org/repo           # from GitHub
npx claude-skills install ./local-path             # from local dir
npx claude-skills update [pkg] [--reconfigure]     # re-apply (skip questions)
npx claude-skills configure <pkg>                  # re-ask questions, re-apply
npx claude-skills list                             # show installed packages
```

---

## 8. Build Sequence

1. `lib/utils/fs-utils.js` + `lib/core/template-engine.js` (lift from setup.js, add tests)
2. `lib/core/expression-evaluator.js` (pure function, ~40 lines)
3. `lib/detectors/*.js` (self-contained async fns)
4. `lib/core/config-loader.js` (schema validation, no ajv — structural check in JS)
5. `lib/core/questioner.js` (readline wrapper, threads when/autoDetect/lockfile prefill)
6. `lib/core/applier.js` + `lib/core/settings-merger.js`
7. `lib/core/manifest.js` + `lib/core/lockfile.js` (JSON read/write wrappers)
8. `lib/core/resolver.js` + `lib/core/fetcher.js`
9. `lib/commands/*.js`
10. `bin/claude-skills.js`
11. Add `claude-skills-config.json` to `drupal-contrib-claude-skills`, end-to-end test

---

## Verification

```bash
# End-to-end test from a fresh Drupal project dir:
npx claude-skills install ./path/to/drupal-contrib-claude-skills

# Verify:
ls .claude/skills/          # skills present
ls .claude/agents/          # agents present
cat .claude/settings.json   # permissions rendered with DDEV_PROJECT etc.
cat CLAUDE.md               # template vars substituted
cat claude-skills.json      # manifest written
cat claude-skills.lock.json # vars recorded

# Re-run (should be non-interactive, use cached vars):
npx claude-skills update drupal-contrib-claude-skills

# Re-configure (should ask questions again, pre-filled):
npx claude-skills configure drupal-contrib-claude-skills --reconfigure
```
