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

### External skills are pulled, not vendored

Two skills are **not** in this repo — `bin/setup.js` pulls both at install time via the same `externalSkills` loop:

| Skill | Upstream repo | Used by |
|---|---|---|
| `playwright-cli` | `microsoft/playwright-cli` | `drupal-e2e-tester` for browser e2e |
| `drupalorg-cli` | `mglaman/drupalorg-cli` | `drupal-issue-start` and others, for Drupal.org issue/MR data |

```bash
npx -y skills@latest add <owner/repo> --skill <name> --agent claude-code --copy -y
```

Do not copy either's contents into `skills/` — they are maintained upstream and updated via `npx skills update`. Each pull is non-fatal: if it fails (offline), setup prints the manual install command and continues. To add another externally-maintained skill, append to the `externalSkills` array in `bin/setup.js` rather than writing a new bespoke block.

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
| `drupalorg-cli` | `{{DRUPAL_CLI_BIN}}` (detected via `which drupalorg`) | Drupal.org issue/MR data |

As of `drupalorg-cli` 0.10.3 this server exposes 17 read-only tools (`issue_show`,
`issue_get_link`, `issue_get_branch`, `issue_get_patch_url`, `issue_get_fork`,
`project_get_issues`, `issue_search`, `project_get_releases`,
`project_get_release_notes`, `maintainer_get_issues`, `mr_list`, `mr_diff`,
`mr_files`, `mr_status`, `mr_logs`, `gitlab_issue_show`, `gitlab_project_issues`).
Verified 2026-07-06 against a live migrated issue (`ai` project, nid 3540491):

- **Works correctly:** `gitlab_issue_show` (takes a full GitLab work-item URL,
  bypasses the classic nid→project lookup) — returns title, description, state,
  labels, timestamps. It does not return comments; `fetch_issue_notes.py`
  (`drupal-gitlab-inline-comments` skill) is still needed for those.
- **Broken for migrated issues** (same root cause as the CLI bug in
  `drupalorg mr:list <nid>` / `issue:get-fork <nid>` — the classic Drupal.org
  REST lookup can't resolve a migrated nid to its project): `mr_list`,
  `mr_status`, `mr_files`, `issue_get_fork` (all error or return
  all-empty/garbage fields). Any tool that resolves project from `nid` alone
  inherits this. `drupal-issue-start`'s `glab mr list --search` Bash fallback
  (Phase 2) is the only working path for MR discovery on migrated issues —
  do not replace it with an MCP tool call until upstream fixes this.
- Not yet verified against a non-migrated issue — assume the nid-based tools
  work correctly there, since the bug is specific to migrated-nid resolution.

A native GitLab MCP for `git.drupalcode.org` is tracked at [drupal.org/project/infrastructure/issues/3557469](https://www.drupal.org/project/infrastructure/issues/3557469). It requires GitLab Duo (paid feature, not yet available). The `@modelcontextprotocol/server-gitlab` npm workaround only exposes write tools (`create_merge_request`, `fork_repository` etc.) which are all in the deny list — not useful until proper read tools are available. Do not add it back until the infrastructure issue is resolved.

---

## What not to do

- Do not add `{{VAR}}` substitution to `copyDirMerge` calls for `skills/` or `agents/` in `bin/setup.js`
- Do not hardcode paths like `web/modules/contrib/` into skill files — use `<webroot>` and detect at runtime
- Do not add duplicate URL parsing or issue-fetching logic to `drupal-issue-agent` — that belongs in `drupal-issue-start`
- Do not add Edit tools or code-fixing steps to `drupal-e2e-tester` — it stays a report-only test runner; fixes go back through `drupal-issue-agent` with explicit approval
- Do not add external npm dependencies to `bin/setup.js` — it uses only Node 18 built-ins (shelling out to `npx`/`which` via `execSync` is fine)
- Do not vendor the `playwright-cli` or `drupalorg-cli` skills (or other upstream-maintained skills) into `skills/` — setup pulls them via `npx skills add`
