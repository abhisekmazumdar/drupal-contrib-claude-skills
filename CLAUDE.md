# CLAUDE.md

Guidance for Claude Code working on this repo.

## What this repo is

A **Claude Code skills and agents package** for Drupal open source contribution — not a Drupal project. No PHP, no Composer, no web server. This repo's output is a set of files installed into a user's Drupal workspace via `npx github:abhisekmazumdar/drupal-contrib-claude-skills` (or `npx /path/to/local/clone`, see README.md).

---

## Repository layout

```
bin/
  setup.js               # CLI entry point
  install.js             # writer()/installTargets() — the actual file-writing logic
  external-skills.js     # pulls externalSkills at install time
skills/                  # skill directories — each has a SKILL.md
agents/                  # agent markdown files
templates/
  CLAUDE.md.template, AGENTS.md.template   # rendered with {{VAR}} substitution
  settings.json.template
  codex/                 # Codex-specific config/rules/hooks templates
  hooks/
    block-dangerous-git.sh   # copied verbatim, chmod +x'd
    check-command.py         # Codex's equivalent guardrail (no {{VAR}} either)
tests/                   # node --test, run in CI
docs/index.html          # hand-written reference site — see below
```

---

## Common commands

No build step, no `npm run` scripts. CI (`.github/workflows/ci.yml`) runs these; run the same after touching `bin/`, `skills/`, `agents/`, or `templates/`:

```bash
node --check bin/setup.js bin/install.js bin/external-skills.js
node --test tests/*.test.js   # includes tests/docs-sync.test.js — see below
grep -rn "{{" skills/ agents/   # must be empty — {{VAR}} only belongs in templates/
node -e "JSON.parse(require('fs').readFileSync('templates/settings.json.template','utf8').replace(/\{\{[A-Z_]+\}\}/g,'placeholder'))"
```

See "Testing setup changes" below to exercise `bin/setup.js` end-to-end.

---

## Key conventions — read before editing anything

### `docs/index.html` — keep it in sync

Hand-written, not generated. Holds the reference detail `README.md` deliberately skips (README stays a quickstart). **Changed a skill, agent, external skill, or a convention below? Check `docs/index.html`.** `tests/docs-sync.test.js` (CI) catches the mechanical half automatically — every skill/agent/externalSkill needs a matching table row, both directions, so a rename or removal fails CI instead of drifting. It doesn't check prose (role descriptions, the issue-record format, conventions) — that's still a manual check.

### `{{VAR}}` lives only in `templates/`

Skills and agents are copied verbatim — never `{{VAR}}`. They reference project paths with angle brackets instead (`<webroot>`, `<drupal-path>`, `<MODULE_PATH>`), resolved by Claude from the installed `CLAUDE.md` context at runtime. `grep -r "{{" skills/ agents/` before editing either — any match is a bug.

### Multi-site support

A workspace can hold more than one Drupal install. `bin/setup.js` detects every top-level Drupal root, names each a **site**, marks one **default**, and renders the result into `CLAUDE.md`'s `## Local environments` table via a `{{SITES_TABLE}}` var assembled in JS (the template substitution can't loop). The lockfile (`.claude/claude-skills.lock.json`) stores `{ sites: {...}, defaultSite }`; older single-site lockfiles migrate automatically, no re-prompting.

Site selection happens exactly **once** — `drupal-issue-start` Phase 0.5, matching the user's wording against the table (falling back to Default). `<site>`/`<webroot>`/`<drupal-path>`/DDEV project/site URL flow downstream unchanged through `drupal-repo-setup`, `drupal-issue-agent`, `drupal-e2e-tester`, `drupal-issue-catchup` — none of them re-resolve or re-prompt. Most skills below that point (`drupal-clone-contrib`, `drupal-issue-reroll`, `drupal-coding-standards`, etc.) need no site-awareness at all; they just operate on whatever module dir they're handed. One exception: DDEV has no `-C`/`--project` flag, so any `ddev` command must run with cwd inside that site's root — noted once per agent that shells out to `ddev`, not repeated per call site.

### Skills are self-contained

Every `skills/<name>/SKILL.md` works without knowing the specific Drupal project layout. Path detection happens inside the skill (`find . -name "vendor/bin/phpcs"`), never baked in at install time.

### Installer file-management model

`bin/install.js`'s `writer()` treats installed files three ways, chosen by whether a project is ever expected to hand-edit that file. **Adding a new installed file? Pick one explicitly** — don't assume `write`/`copy`'s conflict-safe default fits.

- **Force-managed** (`forceWrite`/`copyManaged`): `skills/`, `agents/` (every rendered form), the Git-guardrail hook scripts. Pure toolkit output, never customized per project — every re-run makes the destination match this package version exactly. A local edit gets silently overwritten; a skill/agent removed upstream gets deleted from the project (only paths this toolkit itself wrote, per the lockfile's `files` map — a user's own file under the same directory is never touched). `copyManaged` takes optional `renameFile`/`transformContent` (the Codex `.md`→`.toml` conversion), a `shallow` flag (skip an agent's `references/` subfolder), and `preserve` (paths a sibling `forceWrite` call owns — skip these or `prune()` deletes-then-lets-them-get-readded, which reorders the lockfile's `files` map and breaks idempotency).
- **Merged** (`upsertBlock`): `CLAUDE.md`/`AGENTS.md`. These commonly pre-exist with the project's own content, so the toolkit's block is wrapped in `<!-- drupal-contrib-claude-skills:begin/end -->` markers and upserted in place (appended if no markers yet). Everything outside the block is the project's own, never touched. If `CLAUDE.md`/`AGENTS.md` resolve to the same real file (one symlinked to the other), treat the whole shared file as off-limits — propose instead of force-writing, for both targets, or whichever target runs first mutates it before the second ever notices it's shared.
- **Preserved** (`write`/`copy`): everything else — `.claude/settings.json`, `.mcp.json`, `.codex/config.toml`/`hooks.json`/rules, `.drupal-contrib/context.md`. A package update applies automatically only if the file on disk still matches what the toolkit last wrote (per lockfile content hash); a hand-edited file is left alone and the new version is stashed at `.drupal-contrib/proposals/<path>` for manual merge.

### `disable-model-invocation` — only for skills with no gate of their own

Two skills set it: `drupal-clone-contrib` (runs `git clone` immediately, no internal confirmation) and `drupal-issue-reroll` (runs `git rebase` unprompted in Step 3 — only the push is gated). Both are only ever invoked from behind another skill's `[PAUSE]`; triggering them straight from a passing mention would skip that gate. Every other skill is read-only, writes only append-only to `issues/<nid>/`, or already gates its own writes — those stay auto-triggerable. Add a skill that mutates git/disk with no pause of its own? Set this field.

### External skills are pulled, not vendored

None live in this repo — `bin/setup.js` pulls all of them at install time via the `externalSkills` loop:

| Skill | Upstream repo | Wired in at |
|---|---|---|
| `playwright-cli` | `microsoft/playwright-cli` | `drupal-e2e-tester` Phase 3, browser e2e |
| `drupalorg-cli` | `mglaman/drupalorg-cli` | `drupal-issue-start` and others, Drupal.org issue/MR data |
| `how` | `cursor/plugins` | `drupal-issue-agent` A3/B2, unfamiliar code before review/planning |
| `blast-radius` | `cursor/plugins` | `drupal-issue-agent` A9, before the RTBC verdict |
| `unslop` | `cursor/plugins` | `drupalorg-comment-format`, `drupal-issue-start` Phase 3 |
| `technical-writing` | `cursor/plugins` | same pre-output pass, for structure |
| `interrogate` | `cursor/plugins` | `drupal-issue-agent` A9, offered explicitly, never automatic |
| `why` | `cursor/plugins` | `drupal-issue-catchup` Step 5, design-decision digging |
| `tdd` | `cursor/plugins` | `drupal-issue-agent` A10, bug fixes with a cheap local test target |
| `diagnosing-bugs` | `mattpocock/skills` | `drupal-issue-agent` A1, fallback for unrecognized CI failures |
| `resolving-merge-conflicts` | `mattpocock/skills` | `drupal-issue-reroll` Step 3 |
| `wizard` | `mattpocock/skills` | `drupal-repo-setup` Step 7, setup issues → runnable fix-it script |

```bash
npx -y skills@latest add <owner/repo> --skill <name> --agent claude-code --copy -y
```

Never copy their contents into `skills/` — updated via `npx skills update`. Each pull is non-fatal (offline prints the manual command and continues). Adding another: append to the `externalSkills` array in `bin/setup.js`, don't write a new bespoke block. `cursor/plugins` skills nest under `pstack/skills/<name>`; `blast-radius`/`technical-writing`/`interrogate`/`tdd` ship `disable-model-invocation: true` (explicit slash-invocation only). The loop groups by `repo` and pulls each repo's skills in one call — repeated `--skill` flags work, a comma-separated value silently falls back to an interactive picker and installs nothing.

`writing-for-agents` (`mattpocock/skills`) and the `principle-*` micro-skills (`cursor/plugins`) are useful only for maintaining *this* repo, not an installed Drupal workspace — deliberately not in `externalSkills`. Pull them into this repo's own `.claude/skills/` for local dev only (`.gitignore` excludes `.claude/` for exactly this reason).

### Git guardrail hook

`templates/hooks/block-dangerous-git.sh` hard-blocks `git reset --hard`, `git clean -f`/`-fd`, `git branch -D`, `git checkout .`/`git restore .` — regardless of the `allow` list — since these discard local work with no recovery. **`git push`, including `--force-with-lease`, is deliberately not blocked**: `drupal-issue-reroll` force-pushes to the user's own issue fork as a normal step, already guarded by `--force-with-lease` and the `ask` tier. Adding a blocked pattern? Check first that no skill's workflow relies on it: `grep -rniE "git (reset --hard|clean -f|branch -D|checkout \.|restore \.)" skills/ agents/`.

The same script (`check-command.py`, for Codex, which has no per-tool file permission concept) also blocks reading and writing secret material — `cat`/`grep`/`head`/`cp`/`curl` etc. on one side, `tee`/`dd`/`install`/shell redirection on the other — matching `.env*` (except `.example`/`.sample`/`.dist`/`.template`/`.defaults`/`.test`), `*.pem`/`*.key`/`*.pfx`/`*.p12`, `id_rsa*`/`id_ed25519*`, `.netrc`/`.npmrc`, and anything under `secrets/`/`.ssh/`/`.aws/`. Reuses the hook's tokenizer and shell-`-c` unwrapping, so `bash -c "cat .env"` doesn't slip through. See `READ_BINARIES`/`WRITE_BINARIES`/`SECRET_GLOBS`/`SECRET_DIR_NAMES` to extend it. `templates/settings.json.template`'s `deny` list adds the Claude-Code-only complement — `Edit(...)` denials on the same paths (never `Write(...)`: Claude Code's matcher only checks `Edit(path)` for write checks, so a `Write(...)` deny rule is dead weight the harness flags as unenforced). Both layers are best-effort string/glob matching, not a sandbox.

### Guiding philosophy — move issues toward RTBC, don't just find things

Every review — the light one in `drupal-issue-start` Phase 2.5, the full one in `drupal-issue-agent`'s A9 — ends with a **judgment call**: RTBC-ready, close with a named gap, needs work, or needs discussion. The goal is a mergeable, community-acceptable contribution, not an exhaustive findings list. Cosmetic nitpicks that don't block correctness/security/standards get mentioned once and set aside; don't pad a review with them to look thorough. Change one review layer's framing, check the other matches.

### `references/` subfolder — reference material, not procedure

Keep `agents/*.md` and `SKILL.md` lean, but never fragment a sequential gated procedure — `drupal-issue-agent`'s A1-A11/B1-B5 phases stay inline, splitting them would break the agent's ability to track which `[PAUSE]` it's resuming from. What belongs in `references/`: a lookup consulted only on one specific branch, not the always-active flow — e.g. `agents/drupal-issue-agent/references/ci-failure-patterns.md`, read only when A1 finds a failing pipeline. No `setup.js` changes needed; `copyManaged` already recurses. Before adding one: is this really a rare-branch lookup, or core sequence/an always-consulted checklist (like A7's)? If the latter, keep it inline.

### Agent handoff pattern

Four agents, each with a persona name as a body-level identity — cosmetic only. The frontmatter `name:` (matching the filename) is what every invocation actually uses. **Never invoke by persona name, never change `name:` to match it.**

| File | `name:` | Persona | Role |
|---|---|---|---|
| `drupal-issue-agent.md` | `drupal-issue-agent` | Nora | Full review/implement/fix loop — the only agent that edits module code |
| `drupal-e2e-tester.md` | `drupal-e2e-tester` | Milo | Test phase (PHPUnit + Playwright) — report-only, never edits code |
| `drupal-repo-setup.md` | `drupal-repo-setup` | Wren | Git/repo plumbing — locate, clone, install deps, checkout/worktree. `recon` runs unpaused; Composer install always pauses |
| `drupal-issue-catchup.md` | `drupal-issue-catchup` | Sage | Re-briefs after time away — diffs new activity against the local record |

`drupal-issue-agent` is always invoked by `drupal-issue-start`; its Phase 0/1 are intentionally thin, receiving pre-parsed context rather than re-fetching it. Don't add URL-parsing or issue-fetching logic back to the agent — that belongs in the skill.

`<site>` (and its resolved `<webroot>`/`<drupal-path>`) flows through this whole chain with `<nid>`/`<project>`, resolved once in `drupal-issue-start` Phase 0.5, never re-resolved downstream.

Sub-agents can't talk to the user mid-run, so approval gates use a **pause-relay protocol**: the agent ends with `[PAUSE — awaiting user decision]`, `drupal-issue-start` relays it verbatim, the agent resumes on reply. Keep this intact — don't add a gate that assumes the agent can converse directly.

`drupal-e2e-tester` is deliberately **report-only** — the implementing agent must never verify its own work.

`drupal-repo-setup`'s `probe`/`checkout`/`worktree` modes gate every write (clone, `composer require`, checkout, worktree) behind their own `[PAUSE]`. Its **`recon` mode** (used only by `drupal-issue-start` Phase 2.5) runs clone/checkout/fork-remote automatically, no pause — local and reversible. Composer install still pauses in every mode, since it's the one step that mutates `composer.lock`. `recon` surfaces access/setup problems in a `## Setup issues` block instead of pausing; `drupal-issue-start` relays it verbatim. If `drupal-issue-agent` already received a recon'd `<module_dir>`/`<branch>`, it confirms the checkout still matches instead of re-invoking `drupal-repo-setup`.

`drupal-issue-catchup` never edits code — diffs new activity against `issues/<nid>/README.md`, briefs, waits for direction, and re-derives the `## At a Glance` verdict/next-action/blocker when new activity changes them.

`drupal-related-issues` (`find_related_issues.py`) catches cross-references that only exist in *other* local issue records — a one-directional read of the current issue's own comments misses these. Merged into `## Related Issues`, append-only, labeled by source.

### `issues/<nid>/README.md` format

Written by `drupal-issue-start` Phase 3, appended to by `issue-record-update`. `## At a Glance` (verdict, MR/pipeline, this session's single next action and blocker) and `## Current State` (MR list, setup issues, latest discussion) are **snapshots, overwritten in place** every time — unlike `## Work Log`/`## Related Issues`, which are append-only. `Next action`/`Blocked on` come only from the *current* session, never accumulated, or they go stale. Both sections use the `technical-writing`/`unslop` skills when installed. `**Status:**` is normalized to a fixed vocabulary (see "Status vocabulary" in `drupal-issue-start`); `**Last updated:**` refreshes every session. `**Site:**` appears only once the workspace has 2+ sites configured — single-site workspaces render with no line at all. Adding a section? Decide explicitly which behavior it needs and say so in the template comment.

`issue-record-update` runs **automatically** at the end of any session that did something — reviewed, changed, tested, pushed. A pure read-only catchup skips it, so the Work Log doesn't fill with empty entries. The human can still trigger it manually.

**Work Log archiving:** unbounded growth means every future session re-pays the cost of the whole history. `issue-record-update` Step 6 caps `## Work Log` at the 3 most recent sessions, archiving older ones to `issues/<nid>/history.md` (newest-archived first). Neither `drupal-issue-start` nor `drupal-issue-catchup` reads `history.md` by default — only when a session genuinely needs pre-archive context.

---

## Testing setup changes

```bash
cd /path/to/drupal-workspace
npx /path/to/this/repo
```

Then verify:
- No `{{VAR}}` in installed skills/agents: `grep -r "{{" .claude/skills/ .claude/agents/`
- Lockfile written: `cat .claude/claude-skills.lock.json`
- MCP servers present: `grep -A5 mcpServers .claude/settings.json`

Re-running is non-interactive once the lockfile exists.

---

## MCP servers

`templates/settings.json.template` configures one:

| Server | Binary | Purpose |
|---|---|---|
| `drupalorg-cli` | `{{DRUPAL_CLI_BIN}}` (via `which drupalorg`) | Drupal.org issue/MR data |

`drupalorg-cli` 0.12.0 exposes 17 read-only tools. Verified 2026-09-10 against a live migrated issue (`ai` project, nid 3540491):

- **Works:** `gitlab_issue_show` (full GitLab work-item URL, bypasses nid→project lookup) — title, description, state, labels, timestamps. No comments; `fetch_issue_notes.py` (`drupal-gitlab-inline-comments`) still needed for those.
- `issue_show`'s new `withComments` param (0.12.0) returns full comment bodies, but only for **non-migrated** issues — its `nid` param is still a bare `^\d+$` pattern, no project prefix, so it still errors on a migrated nid.
- **Still broken for migrated issues:** `mr_list`, `mr_status`, `mr_files`, `issue_get_fork` all error (`-32603`) on a migrated nid. The underlying CLI *commands* were fixed in 0.11.0 (resolve correctly given `<project>#<nid>`), but the MCP tool schemas were never updated to expose a project-prefix field — any MCP tool that resolves project from `nid` alone inherits this gap. `drupal-issue-start`'s `glab mr list --search` Bash fallback (Phase 2) is still the only working path for MR discovery on migrated issues — don't replace it with an MCP call until the schemas gain a project-prefix param (tracked at [mglaman/drupalorg-cli](https://github.com/mglaman/drupalorg-cli); re-check `tools/list` after future releases).
- Not yet verified against a non-migrated issue — assume nid-based tools work there, since the bug is migrated-nid-specific.

A native GitLab MCP for `git.drupalcode.org` is tracked at [drupal.org/project/infrastructure/issues/3557469](https://www.drupal.org/project/infrastructure/issues/3557469); needs GitLab Duo (paid, not yet available). The `@modelcontextprotocol/server-gitlab` npm workaround only exposes write tools, all deny-listed — not useful until read tools exist. Don't add it back before that infrastructure issue resolves.

---

## What not to do

- Don't add `{{VAR}}` substitution to `copyManaged` calls for `skills/` or `agents/` in `bin/setup.js`
- Don't hardcode paths like `web/modules/contrib/` into skill files — use `<webroot>`, detect at runtime
- Don't add duplicate URL-parsing or issue-fetching logic to `drupal-issue-agent` — that's `drupal-issue-start`'s job
- Don't add Edit tools or code-fixing steps to `drupal-e2e-tester` — report-only; fixes go back through `drupal-issue-agent` with explicit approval
- Don't add external npm dependencies to `bin/setup.js` — Node 18 built-ins only (shelling out to `npx`/`which` via `execSync` is fine)
- Don't vendor `playwright-cli`, `drupalorg-cli`, or other upstream-maintained skills into `skills/` — setup pulls them via `npx skills add`
