# CLAUDE.md

This file provides guidance to Claude Code when working on this repository.

## What this repo is

A **Claude Code skills and agents package** for Drupal open source contribution. It is not a Drupal project — there is no PHP, no Composer, no web server. The output of this repo is the set of files that get installed into a user's Drupal workspace via `npx github:abhisekmazumdar/drupal-contrib-claude-skills` (or `npx /path/to/local/clone` — see README.md).

---

## Repository layout

```
bin/
  setup.js              # CLI entry point — run via `npx github:abhisekmazumdar/drupal-contrib-claude-skills`
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
# (DDEV_PROJECT, SITE_URL, PHP_VERSION, MARIADB_VERSION, DRUPAL_PATH, DRUPAL_WEBROOT, DRUPAL_CLI_BIN, SITES_TABLE)
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

### Multi-site support

A workspace can hold more than one Drupal install (e.g. `drupal/`, `cms/`,
an umami demo). `bin/setup.js` detects every top-level Drupal root (or the
single install when the toolchain is set up from inside a Drupal codebase
itself, e.g. `cd drupal11 && npx drupal-claude-skills`), configures each as
a named **site** (the directory name, or the workspace's own basename at
the root), and marks one **default**. All of this is rendered into
`CLAUDE.md`'s `## Local environments` table via a single `{{SITES_TABLE}}`
var built in `bin/setup.js` (the simple `{{VAR}}` substitution in
`renderTemplate` can't loop, so the table is assembled in JS, not in the
template). The lockfile (`.claude/claude-skills.lock.json`) stores
`{ sites: {...}, defaultSite }`; older single-site lockfiles are migrated
into this shape automatically on the next `setup.js` run, no re-prompting
for already-known values.

Skill/agent code never re-implements site selection — it happens exactly
once, in `drupal-issue-start` Phase 0.5, which matches the user's wording
against the table's Name column (falling back to Default when unmentioned)
and resolves `<site>`/`<webroot>`/`<drupal-path>`/DDEV project/site URL as
concrete values. Those values then flow downstream unchanged through
`drupal-repo-setup`, `drupal-issue-agent`, `drupal-e2e-tester`, and
`drupal-issue-catchup` — none of them re-resolve or re-prompt for a site.
This works because `<webroot>`/`<drupal-path>` were already an indirection
layer (see above) — most skills below the resolution point (
`drupal-clone-contrib`, `drupal-issue-reroll`, `drupal-coding-standards`,
etc.) need no site-awareness at all, since they only ever operate on
whatever module dir they're handed. The one thing that does need explicit
handling per site: DDEV has no `-C`/`--project` flag, so any `ddev` command
must run with cwd inside that site's root first — documented once as a
convention note in each agent that shells out to `ddev`, not repeated per
call site.

### Skills are self-contained

Each skill in `skills/<name>/SKILL.md` must work without knowing the specific Drupal project layout. Path detection belongs inside the skill (e.g. `find . -name "vendor/bin/phpcs"`), not baked in at install time.

### `disable-model-invocation` — only for skills that mutate with no gate of their own

Two of this repo's own skills set `disable-model-invocation: true`: `drupal-clone-contrib` (runs `git clone` immediately, no internal confirmation) and `drupal-issue-reroll` (runs `git rebase` in Step 3 unprompted — only the later push is gated). Both are otherwise only ever invoked from behind another skill's own `[PAUSE]` (`drupal-repo-setup` gates every `drupal-clone-contrib` call it makes); triggering them straight from a passing natural-language mention would skip that gate entirely. Every other skill in `skills/` is either read-only, writes only to `issues/<nid>/` (low-risk, local, append-only), or already asks for confirmation internally before writing anywhere else — those stay on the default (auto-triggerable). If you add a skill that performs an unprompted git/disk mutation with no pause of its own, set this field; otherwise leave it off.

### External skills are pulled, not vendored

None of these skills live in this repo — `bin/setup.js` pulls all of them at install time via the same `externalSkills` loop:

| Skill | Upstream repo | Wired in at |
|---|---|---|
| `playwright-cli` | `microsoft/playwright-cli` | `drupal-e2e-tester` Phase 3, for browser e2e |
| `drupalorg-cli` | `mglaman/drupalorg-cli` | `drupal-issue-start` and others, for Drupal.org issue/MR data |
| `how` | `cursor/plugins` | `drupal-issue-agent` A3 (Path A, unfamiliar code before reviewing the diff) and B2 (Path B, before drafting the plan) |
| `blast-radius` | `cursor/plugins` | `drupal-issue-agent` A9, before finalizing the RTBC verdict — checks what the diff breaks outside itself |
| `unslop` | `cursor/plugins` | `drupalorg-comment-format` and `drupal-issue-start` Phase 3, pre-output writing pass |
| `technical-writing` | `cursor/plugins` | Same pre-output pass, for structure (issue summaries, MR descriptions, commit messages) |
| `interrogate` | `cursor/plugins` | `drupal-issue-agent` A9, offered explicitly ("want a second opinion?") — explicit-invocation only, never automatic |
| `why` | `cursor/plugins` | `drupal-issue-catchup` Step 5, when new activity hinges on a design decision the comment thread doesn't explain |
| `tdd` | `cursor/plugins` | `drupal-issue-agent` A10, for bug fixes with a cheap local test target; skipped when the test path is expensive |
| `diagnosing-bugs` | `mattpocock/skills` | `drupal-issue-agent` A1, fallback when a CI failure doesn't match the known-pattern table |
| `resolving-merge-conflicts` | `mattpocock/skills` | `drupal-issue-reroll` Step 3, before proposing a resolution for each conflicted file |
| `wizard` | `mattpocock/skills` | `drupal-repo-setup` Step 7, turning a non-empty `## Setup issues` block into a runnable fix-it script |

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

### Reference material vs. procedure — when to split into a `references/` subfolder

`agents/*.md` and `skills/<name>/SKILL.md` files should stay lean when
possible, but not at the cost of fragmenting a sequential, gated procedure —
splitting `drupal-issue-agent`'s A1-A11/B1-B5 phases into pieces would break
the agent's ability to track which `[PAUSE]` it's resuming from across a
long session, so those stay inline. What *does* belong in a
`references/` subfolder next to the agent/skill file is content that's a
lookup, consulted only in one specific branch, not part of the always-active
flow — e.g. `agents/drupal-issue-agent/references/ci-failure-patterns.md`,
read only when A1 finds a failing pipeline. `bin/setup.js`'s `copyDirMerge`
already copies `agents/` and `skills/` recursively, so a `references/`
subfolder needs no setup.js changes to ship. Before adding one, check
whether the content is really a rare-branch lookup table — if it's core
sequence or an always-consulted checklist (like A7's review checklist),
keep it inline instead.

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

`<site>` (and its resolved `<webroot>`/`<drupal-path>`) flows through this
whole chain alongside `<nid>`/`<project>` — resolved once in
`drupal-issue-start` Phase 0.5, never re-resolved by any agent it hands off
to. See "Multi-site support" above.

Sub-agents cannot talk to the user mid-run, so approval gates use a **pause-relay protocol**: the agent ends its run with a `[PAUSE — awaiting user decision]` report, `drupal-issue-start` relays it verbatim, and the agent is resumed/re-invoked with the user's reply. Keep this protocol intact — do not add gates that assume the agent can converse directly.

`drupal-e2e-tester` is the dedicated test phase (PHPUnit + Playwright browser e2e), invoked by `drupal-issue-agent` at Phase T or directly by the user. It is deliberately **report-only** — the implementing agent must never be the one verifying its own work.

`drupal-repo-setup` is invoked by `drupal-issue-agent` (and can be invoked directly by `drupal-issue-start`) whenever a local module directory needs preparing — locating, cloning, installing missing Composer dependencies, and checking out a branch or creating a worktree. Its `probe`/`checkout`/`worktree` modes keep every write (clone, `composer require`, checkout, worktree) behind its own `[PAUSE]`, unchanged from before.

`drupal-repo-setup` also has a **`recon` mode**, used only by `drupal-issue-start`'s Phase 2.5, before its report: clone, branch checkout, and fork-remote setup all run **automatically, no pause** — they're local-only and reversible. Composer install still pauses in every mode, since it's the one step that mutates `composer.lock`. `recon` surfaces access/setup problems (no fork, no push access, DDEV down) in a `## Setup issues` block instead of pausing on them — `drupal-issue-start` relays that block verbatim into its report. When `drupal-issue-agent` receives an already-recon'd `<module_dir>`/`<branch>` from `drupal-issue-start`, it confirms the checkout still matches instead of re-invoking `drupal-repo-setup`.

`drupal-issue-catchup` is invoked directly by the user ("catch me up on issue N") or from `drupal-issue-start`'s Phase 5 routing table. It never edits code — it diffs new activity against `issues/<nid>/README.md` and briefs, waiting for direction like every other agent here. It also re-derives the `## At a Glance` verdict, next action, and blocker when new activity would change them.

The `drupal-related-issues` skill (`find_related_issues.py`) is used by both `drupal-issue-start` and `drupal-issue-catchup` to catch cross-references that only exist in *other* local issue records — a one-directional read of the current issue's own comments misses these. Results are merged into `## Related Issues`, append-only, labeled by source (comment thread vs. backlink scan).

### `issues/<nid>/README.md` format

Written/updated by `drupal-issue-start` (Phase 3) and appended to by
`issue-record-update`. Two sections work differently from the rest: `## At a
Glance` (verdict, current MR + pipeline, this session's single next action
and blocker) and `## Current State` (MR list, setup issues, latest
discussion — the persisted version of the Phase 4 chat report) are both
**snapshots, overwritten in place** every time they're re-derived — never
append-only like `## Work Log` and `## Related Issues`. `Next action` /
`Blocked on` are sourced only from the *current* session, never accumulated
across sessions, or they go stale. Both sections are written as short
bullet points via the `technical-writing`/`unslop` skills when installed
(see "Writing the record" in `drupal-issue-start`), so a future session
doesn't have to re-fetch live state to get oriented. The header's
`**Status:**` field is normalized to a fixed vocabulary (see
`drupal-issue-start`'s "Status vocabulary") so it's scannable across
issues, not just within one, and `**Last updated:**` is refreshed every
session. The header also carries a `**Site:**` line naming which configured
Drupal install this issue was worked against — but only once the workspace
has 2+ sites configured (see "Multi-site support" above); single-site
workspaces render exactly as before, no `**Site:**` line at all. If you add another section, decide explicitly which behavior it
needs and say so in the template comment, the way `## At a Glance`, `##
Current State`, and `## Notes` already do.

`issue-record-update` is invoked **automatically** at the end of any session
in `drupal-issue-start`/`drupal-issue-agent` that did something — code
reviewed, changed, tested, or a comment/push attempted. A pure read-only
catchup or browse with nothing done skips it, so the Work Log doesn't fill
up with empty "reviewed the issue" entries. The human can still trigger it
manually any time, e.g. to add their own context to an entry.

**Work Log archiving (token-cost control):** `drupal-issue-start` and
`drupal-issue-catchup` both read `issues/<nid>/README.md` in full on every
visit, so an unbounded Work Log means every future session re-pays the cost
of the whole history even when it only needs the last one. `issue-record-update`
Step 6 keeps the README's `## Work Log` capped at the 3 most recent
sessions, moving anything older to `issues/<nid>/history.md` (newest-archived
first, same relative order as the Work Log). Neither `drupal-issue-start`
Phase 1 nor `drupal-issue-catchup` Step 1 reads `history.md` by default —
only when a session genuinely needs pre-archive context (e.g. `why`-skill
rationale digging in `drupal-issue-catchup` Step 5).

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
