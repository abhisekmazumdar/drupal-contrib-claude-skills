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
  hooks/
    block-dangerous-git.sh  # copied verbatim (no {{VAR}}) to .claude/hooks/, chmod +x'd
```

---

## Common commands

There's no build step, no test suite, and no `npm run` scripts — `package.json` only declares the `bin` entry. CI (`.github/workflows/ci.yml`) runs these checks directly against the repo; run them the same way after editing `bin/setup.js`, `skills/`, `agents/`, or `templates/`:

```bash
# Syntax-check the setup script
node --check bin/setup.js

# Every skills/<name>/SKILL.md and agents/*.md must have a --- frontmatter
# block with a name: matching its directory/filename, plus a description:
# (exact check lives in .github/workflows/ci.yml under "Validate skill and agent frontmatter")

# {{VAR}} placeholders may only appear in templates/, and only from the known set
# (DDEV_PROJECT, SITE_URL, PHP_VERSION, MARIADB_VERSION, DRUPAL_PATH, DRUPAL_WEBROOT, DRUPAL_CLI_BIN)
grep -rn "{{" skills/ agents/   # must be empty

# templates/settings.json.template must still be valid JSON once vars are substituted
node -e "JSON.parse(require('fs').readFileSync('templates/settings.json.template','utf8').replace(/\{\{[A-Z_]+\}\}/g,'placeholder'))"
```

See "Testing setup changes" below for exercising `bin/setup.js` end-to-end against a real workspace.

---

## Key conventions — read before editing anything

### Template vars belong only in `templates/`

`{{VAR}}` placeholders are substituted at install time **only** for files in `templates/`. Skills and agents are copied verbatim — they must never contain `{{VAR}}` patterns.

Instead, skills reference project paths using angle-bracket placeholders (`<webroot>`, `<drupal-path>`, `<MODULE_PATH>`) that Claude resolves from the installed `CLAUDE.md` context at runtime.

**Before editing a skill or agent:** `grep -r "{{" skills/ agents/` — if you see any matches, that is a bug.

### Skills are self-contained

Each skill in `skills/<name>/SKILL.md` must work without knowing the specific Drupal project layout. Path detection belongs inside the skill (e.g. `find . -name "vendor/bin/phpcs"`), not baked in at install time.

### External skills are pulled, not vendored

None of these skills live in this repo — `bin/setup.js` pulls all of them at install time via the same `externalSkills` loop:

| Skill | Upstream repo | Used by |
|---|---|---|
| `playwright-cli` | `microsoft/playwright-cli` | `drupal-e2e-tester` for browser e2e |
| `drupalorg-cli` | `mglaman/drupalorg-cli` | `drupal-issue-start` and others, for Drupal.org issue/MR data |
| `how` | `cursor/plugins` | Mental model of unfamiliar contrib code before `drupal-issue-agent` edits it |
| `blast-radius` | `cursor/plugins` | Checks what a change breaks outside the diff before the A9 RTBC verdict |
| `unslop` | `cursor/plugins` | Strips AI writing tells from issue comments/commit messages, alongside `drupalorg-comment-format` |
| `technical-writing` | `cursor/plugins` | Layered writing standard for issue summaries, MR descriptions, commit messages |
| `interrogate` | `cursor/plugins` | Adversarial multi-model second opinion on a review verdict — report-only, like `drupal-e2e-tester` |
| `why` | `cursor/plugins` | Cited design-rationale digging across VCS/issue-queue evidence, complementing `drupal-issue-catchup` |
| `tdd` | `cursor/plugins` | Red-green discipline for bug fixes with a cheap local test target; skips when the test path is expensive |
| `diagnosing-bugs` | `mattpocock/skills` | Phased reproduce/hypothesize/isolate loop for hard bugs before `drupal-issue-agent` implements a fix |
| `resolving-merge-conflicts` | `mattpocock/skills` | Reads each side's originating issue/MR before resolving conflicts `drupal-issue-reroll` surfaces |
| `wizard` | `mattpocock/skills` | Turns `drupal-repo-setup` recon's `## Setup issues` block into a runnable fix-it script for the human |

```bash
npx -y skills@latest add <owner/repo> --skill <name> --agent claude-code --copy -y
```

Do not copy any of their contents into `skills/` — they are maintained upstream and updated via `npx skills update`. Each pull is non-fatal: if it fails (offline), setup prints the manual install command and continues. To add another externally-maintained skill, append to the `externalSkills` array in `bin/setup.js` rather than writing a new bespoke block.

`cursor/plugins` skills are nested under `pstack/skills/<name>` in that repo, and several (`blast-radius`, `technical-writing`, `interrogate`, `tdd`) ship `disable-model-invocation: true` — they need explicit slash-invocation rather than triggering automatically.

The `externalSkills` loop groups entries by `repo` and pulls each repo's skills in one `npx skills add <repo> --skill a --skill b …` call (repeated `--skill` flags work; a single comma-separated value does not — it silently falls back to an interactive picker and installs nothing). This avoids cloning the same upstream repo once per skill. When adding a skill from a repo already in the array, just append another entry — the grouping is automatic, nothing else to wire up.

Two skills from these same source repos are useful only for maintaining *this* repo (writing/reviewing skill and agent files) and are deliberately **not** in `externalSkills` — they'd have no purpose in an installed Drupal workspace: `writing-for-agents` (`mattpocock/skills`) and the `principle-fix-root-causes` / `principle-prove-it-works` / `principle-guard-the-context-window` micro-skills (`cursor/plugins`). Pull these into this repo's own `.claude/skills/` for local dev use only — `.gitignore` excludes `.claude/` and `skills-lock.json` for exactly this reason.

### Git guardrail hook

`templates/settings.json.template` wires a `PreToolUse` hook (`templates/hooks/block-dangerous-git.sh`, copied to `.claude/hooks/` and chmod +x'd by `bin/setup.js`) that hard-blocks `git reset --hard`, `git clean -f`/`-fd`, `git branch -D`, and `git checkout .`/`git restore .` regardless of the permissions `allow` list above — these discard local work with no recovery path. Adapted from `mattpocock/skills`' `git-guardrails-claude-code`, but **`git push` (including `--force-with-lease`) is deliberately not blocked**: `drupal-issue-reroll` force-pushes rerolled branches to the user's own issue fork as a normal, expected step, already safe-guarded by `--force-with-lease` and gated behind the `ask` permission tier. If you add more blocked patterns, check first that no skill's documented workflow relies on them (`grep -rniE "git (reset --hard|clean -f|branch -D|checkout \.|restore \.)" skills/ agents/`).

### Guiding philosophy — move issues toward RTBC, don't just find things

Every review this package produces — the light preliminary one in
`drupal-issue-start` Phase 2.5 and the full one in `drupal-issue-agent`'s A9 —
ends with a **judgment call**: RTBC-ready, close with a named gap, needs
work with a named gap, or needs discussion. The goal is a mergeable,
community-acceptable contribution, not an exhaustively long findings list.
Cosmetic nitpicks that don't block correctness, security, or standards get
mentioned once and set aside — they are not blocking findings and reviews
should not be padded with them to look thorough. Both review layers share
this framing; if you change one, check whether the other needs to match.

### Agent handoff pattern

Four agents in `agents/`, each with a persona name as a body-level identity
(first line after frontmatter) — the persona name is cosmetic only; the
frontmatter `name:` field (matching the filename) is what every invocation
and cross-reference actually uses. Never invoke an agent by its persona
name, and never change a frontmatter `name:` to match the persona.

| File | Frontmatter `name:` | Persona | Role |
|---|---|---|---|
| `drupal-issue-agent.md` | `drupal-issue-agent` | Nora | Full review/implement/fix loop — the only agent that edits module code |
| `drupal-e2e-tester.md` | `drupal-e2e-tester` | Milo | Dedicated test phase (PHPUnit + Playwright) — report-only, never edits code |
| `drupal-repo-setup.md` | `drupal-repo-setup` | Wren | Git/repo plumbing — locate, clone, install missing dependencies via Composer, checkout/worktree. `recon` mode (clone+checkout+fork-remote) runs unpaused; Composer install always pauses |
| `drupal-issue-catchup.md` | `drupal-issue-catchup` | Sage | Re-briefs on an issue after time away — diffs new activity against the local record |

`drupal-issue-agent` is always invoked by `drupal-issue-start`. The agent's Phase 0 and Phase 1 are intentionally thin — they receive pre-parsed context from the skill rather than re-fetching it. Do not add URL parsing or issue-fetching logic back to the agent.

Sub-agents cannot talk to the user mid-run, so approval gates use a **pause-relay protocol**: the agent ends its run with a `[PAUSE — awaiting user decision]` report, `drupal-issue-start` relays it verbatim, and the agent is resumed/re-invoked with the user's reply. Keep this protocol intact — do not add gates that assume the agent can converse directly.

`drupal-e2e-tester` is the dedicated test phase (PHPUnit + Playwright browser e2e), invoked by `drupal-issue-agent` at Phase T or directly by the user. It is deliberately **report-only** — the implementing agent must never be the one verifying its own work.

`drupal-repo-setup` is invoked by `drupal-issue-agent` (and can be invoked directly by `drupal-issue-start`) whenever a local module directory needs preparing — locating, cloning, installing missing Composer dependencies, and checking out a branch or creating a worktree. Its `probe`/`checkout`/`worktree` modes keep every write (clone, `composer require`, checkout, worktree) behind its own `[PAUSE]`, unchanged from before.

`drupal-repo-setup` also has a **`recon` mode**, used only by `drupal-issue-start`'s Phase 2.5, before its report: clone, branch checkout, and fork-remote setup all run **automatically, no pause** — they're local-only and reversible. Composer install still pauses in every mode, since it's the one step that mutates `composer.lock`. `recon` surfaces access/setup problems (no fork, no push access, DDEV down) in a `## Setup issues` block instead of pausing on them — `drupal-issue-start` relays that block verbatim into its report. When `drupal-issue-agent` receives an already-recon'd `<module_dir>`/`<branch>` from `drupal-issue-start`, it confirms the checkout still matches instead of re-invoking `drupal-repo-setup`.

`drupal-issue-catchup` is invoked directly by the user ("catch me up on issue N") or from `drupal-issue-start`'s Phase 5 routing table. It never edits code — it diffs new activity against `issues/<nid>/README.md` and briefs, waiting for direction like every other agent here. It also re-derives the `## Review Status` verdict when new activity would change it.

The `drupal-related-issues` skill (`find_related_issues.py`) is used by both `drupal-issue-start` and `drupal-issue-catchup` to catch cross-references that only exist in *other* local issue records — a one-directional read of the current issue's own comments misses these. Results are merged into `## Related Issues`, append-only, labeled by source (comment thread vs. backlink scan).

### `issues/<nid>/README.md` format

Written/updated by `drupal-issue-start` (Phase 3) and appended to by
`issue-record-update`. One section works differently from the rest: `##
Review Status` (verdict + `As of: MR !<iid> @ <sha> (<date>)`) is a
**snapshot, overwritten in place** every time it's re-derived — never
append-only like `## Work Log` and `## Related Issues`. If you add another
section, decide explicitly which behavior it needs and say so in the
template comment, the way `## Review Status` and `## Notes` already do.

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
