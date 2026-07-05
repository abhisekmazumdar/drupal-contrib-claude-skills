# CLAUDE.md

This file provides guidance to Claude Code when working on this repository.

## What this repo is

A **Claude Code skills and agents package** for Drupal open source contribution. It is not a Drupal project — there is no PHP, no Composer, no web server. The output of this repo is the set of files that get installed into a user's Drupal workspace via `npx ~/drupal-claude-skills`.

---

## Repository layout

```
bin/
  setup.js              # CLI entry point — run via `npx ~/drupal-claude-skills`
skills/                 # skill directories — each contains a SKILL.md
agents/                 # agent markdown files
templates/
  CLAUDE.md.template    # rendered at install time with {{VAR}} substitution
  settings.json.template  # rendered at install time with {{VAR}} substitution
```

---

## Key conventions — read before editing anything

### Template vars belong only in `templates/`

`{{VAR}}` placeholders are substituted at install time **only** for files in `templates/`. Skills and agents are copied verbatim — they must never contain `{{VAR}}` patterns.

Instead, skills reference project paths using angle-bracket placeholders (`<webroot>`, `<drupal-path>`, `<MODULE_PATH>`) that Claude resolves from the installed `CLAUDE.md` context at runtime.

**Before editing a skill or agent:** `grep -r "{{" skills/ agents/` — if you see any matches, that is a bug.

### Skills are self-contained

Each skill in `skills/<name>/SKILL.md` must work without knowing the specific Drupal project layout. Path detection belongs inside the skill (e.g. `find . -name "vendor/bin/phpcs"`), not baked in at install time.

### Agent handoff pattern

`drupal-issue-agent` is always invoked by `drupal-issue-start`. The agent's Phase 0 and Phase 1 are intentionally thin — they receive pre-parsed context from the skill rather than re-fetching it. Do not add URL parsing or issue-fetching logic back to the agent.

Sub-agents cannot talk to the user mid-run, so approval gates use a **pause-relay protocol**: the agent ends its run with a `[PAUSE — awaiting user decision]` report, `drupal-issue-start` relays it verbatim, and the agent is resumed/re-invoked with the user's reply. Keep this protocol intact — do not add gates that assume the agent can converse directly.

`drupal-e2e-tester` is the dedicated test phase (PHPUnit + Playwright browser e2e), invoked by `drupal-issue-agent` at Phase T or directly by the user. It is deliberately **report-only** — the implementing agent must never be the one verifying its own work.

---

## Testing setup changes

To test `bin/setup.js` against a real project, run it from the target workspace:

```bash
cd /path/to/drupal-workspace
npx /path/to/this/repo
```

After setup, verify:
- No `{{VAR}}` in installed skills/agents: `grep -r "{{" .claude/skills/ .claude/agents/`
- Lockfile written: `cat .claude/claude-skills.lock.json`
- MCP servers present in settings: `grep -A5 mcpServers .claude/settings.json`

Re-running is non-interactive once the lockfile exists.

---

## MCP servers

`templates/settings.json.template` configures one MCP server:

| Server | Binary | Purpose |
|---|---|---|
| `drupalorg-cli` | `{{DRUPAL_CLI_BIN}}` (detected via `which drupalorg`) | Drupal.org issue/MR data (no tools exposed yet — wired up for future use) |

A native GitLab MCP for `git.drupalcode.org` is tracked at [drupal.org/project/infrastructure/issues/3557469](https://www.drupal.org/project/infrastructure/issues/3557469). It requires GitLab Duo (paid feature, not yet available). The `@modelcontextprotocol/server-gitlab` npm workaround only exposes write tools (`create_merge_request`, `fork_repository` etc.) which are all in the deny list — not useful until proper read tools are available. Do not add it back until the infrastructure issue is resolved.

---

## What not to do

- Do not add `{{VAR}}` substitution to `copyDirMerge` calls for `skills/` or `agents/` in `bin/setup.js`
- Do not hardcode paths like `web/modules/contrib/` into skill files — use `<webroot>` and detect at runtime
- Do not add duplicate URL parsing or issue-fetching logic to `drupal-issue-agent` — that belongs in `drupal-issue-start`
- Do not add Edit tools or code-fixing steps to `drupal-e2e-tester` — it stays a report-only test runner; fixes go back through `drupal-issue-agent` with explicit approval
- Do not add external npm dependencies to `bin/setup.js` — it uses only Node 18 built-ins
