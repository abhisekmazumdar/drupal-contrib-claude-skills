# drupal-claude-skills

[![CI](https://github.com/abhisekmazumdar/drupal-contrib-claude-skills/actions/workflows/ci.yml/badge.svg)](https://github.com/abhisekmazumdar/drupal-contrib-claude-skills/actions/workflows/ci.yml)

Claude Code skills and agents for Drupal open source contribution. Run once from your workspace root to install everything you need to start working on Drupal.org issues with Claude Code.

## What gets installed

- **Skills** in `.claude/skills/` covering DDEV, PHPCS/PHPCBF, PHPUnit, GitLab MR workflow, drupalorg-cli, and more
- **Agents** in `.claude/agents/` — give the issue agent a Drupal.org or GitLab work-item URL and it handles the full issue lifecycle end-to-end
- **CLAUDE.md** at your workspace root — pre-filled with your DDEV project name, site URL, stack details, and correct module paths
- **`.claude/settings.json`** — pre-configured Claude Code permissions and MCP server definitions for drupalorg-cli and GitLab
- **`.claude/claude-skills.lock.json`** — records your answers so re-runs are non-interactive

## Requirements

- [Node.js](https://nodejs.org) 18 or later (for `npx`)
- [Claude Code](https://claude.ai/code) installed and authenticated
- A running DDEV Drupal project
- The following CLI tools installed and on PATH:
  - [`drupalorg-cli`](https://github.com/mglaman/drupalorg-cli) (`drupalorg`)
  - [GitLab CLI](https://gitlab.com/gitlab-org/cli) (`glab`) — authenticated against `git.drupalcode.org`
Two skills are pulled from their upstream repos automatically at install time
(needs network access on first run) rather than bundled in this repo — update
either later with `npx skills update`:
- The [playwright-cli skill](https://github.com/microsoft/playwright-cli), used by the browser-based e2e test phase (`drupal-e2e-tester`)
- The [drupalorg-cli skill](https://github.com/mglaman/drupalorg-cli), used by `drupal-issue-start` and others for Drupal.org issue/MR data

## Supported project layouts

The script works with two common workspace structures:

**Structure A — Drupal is the workspace root**
```
my-drupal-project/       ← run the script from here
  .claude/               ← installed here
  web/
  composer.json
  CLAUDE.md
```

**Structure B — Drupal lives in a subdirectory**
```
my-workspace/            ← run the script from here
  .claude/               ← installed here
  drupal/                ← your Drupal project
    web/
    composer.json
  issues/
  CLAUDE.md
```

The script auto-detects which layout you have and asks if it can't tell.

## Installation

This repo is public but isn't published to npm — run it straight from
GitHub with `npx`, no clone needed, from any machine with Node 18+ and
network access:

```bash
npx github:abhisekmazumdar/drupal-contrib-claude-skills
```

Add a shell alias so you don't have to remember it:

```bash
# add to ~/.zshrc or ~/.bashrc
alias drupal-claude-skills='npx --yes github:abhisekmazumdar/drupal-contrib-claude-skills'
```

`--yes` skips npx's "ok to install?" confirmation on machines where it would
otherwise prompt — safe here since this is a project you control.

### Alternative: clone locally

Prefer a pinned copy (offline reuse, a specific commit, or editing the
skills yourself)? Clone it and point `npx` at the local path instead:

```bash
git clone git@github.com:abhisekmazumdar/drupal-contrib-claude-skills.git /path/to/drupal-claude-skills
npx /path/to/drupal-claude-skills
```

---

The script asks a few questions — all have sensible defaults:

```
Where is your Drupal project? [drupal (auto-detected)]:

DDEV project name [my-drupal-project]:
Site URL [https://my-drupal-project.ddev.site]:
PHP version [8.4]:
MariaDB version [11.8]:
```

- The Drupal project location is asked **first** so the DDEV project name can be auto-detected from `.ddev/config.yaml` in that directory.
- If Drupal is at the workspace root, the location question is skipped entirely.
- Press Enter to accept any default, or type a custom value.
- Answers are saved to `.claude/claude-skills.lock.json` — re-runs pre-fill every question so updates are non-interactive.

### What happens

1. `.claude/skills/` is created (or updated) with all package skills
2. `.claude/agents/` is created (or updated) with all agents; the external `playwright-cli` and `drupalorg-cli` skills are pulled from their upstream repos via `npx skills` if not already installed
3. `.claude/settings.json` is written with pre-approved permissions and MCP server definitions
4. `CLAUDE.md` is generated at the workspace root with your project details substituted in
5. `.claude/claude-skills.lock.json` is written with your answers for future re-runs

Re-running is always safe — files only in the destination (your own custom skills) are never touched. All package files are updated to the latest version.

### MCP servers

The generated `settings.json` wires up the `drupalorg-cli` MCP server automatically, using the `drupalorg` binary detected on your PATH during setup.

A native GitLab MCP server for `git.drupalcode.org` is being tracked in [drupal.org/project/infrastructure/issues/3557469](https://www.drupal.org/project/infrastructure/issues/3557469) — it requires GitLab Duo which is not yet available on the Drupal infrastructure. Until then, GitLab interaction uses `glab` CLI and the bundled Python scripts.

## After installation

Open the workspace in Claude Code and paste a Drupal.org issue URL:

```
https://www.drupal.org/project/ai/issues/3499692
```

Or run the entry point skill directly:

```
/drupal-issue-start https://www.drupal.org/project/ai/issues/3499692
```

The skill loads any prior work from `issues/<nid>/README.md`, fetches live issue state (every open MR, all inline and top-level comments), cross-checks other local issue records for backlinks to this one, then automatically checks out the most relevant MR locally and gives it a light preliminary read — no approval needed for the checkout itself, since it's local and reversible. If more than one MR is open, it picks the most active one and lists the rest so you can redirect. The resulting report leads with a verdict (RTBC-ready, close with a named gap, needs work with a named gap, or needs discussion) plus anything you need to know before trusting it — missing fork access, no push access, DDEV not running — and only *then* asks what you want to do. From there it delegates to whichever agent the job needs:

| Agent | What it does |
|---|---|
| `drupal-issue-agent` | Full review, implementation, and fix loop — the only one that edits module code |
| `drupal-repo-setup` | Locates/clones the module, installs any missing dependencies via Composer, checks out the MR branch or creates a worktree |
| `drupal-e2e-tester` | Dedicated test phase — PHPUnit via DDEV plus Playwright browser e2e — report-only, never edits code |
| `drupal-issue-catchup` | Re-briefs you on an issue after time away, diffing new activity against the local record |

Beyond that automatic recon checkout, agents pause at every approval gate — the skill relays each pause report back to you and nothing is written, edited, `composer require`'d, committed, or posted without your explicit go-ahead.

GitLab work-item URLs are also supported:

```
https://git.drupalcode.org/project/ai/-/work_items/3499692
```

## Issue tracking

Every issue you work on gets a persistent record at `issues/<nid>/README.md`. This is the long-term memory for contribution work — it survives across sessions and is read at the start of every session.

```
issues/
└── 3499692/
    └── README.md         ← summary, work log, notes
```

## Updating

**If you installed via `npx github:...`:** just re-run the same command —
`npx` fetches the current `main` branch each time, so re-running always
picks up the latest version. The lockfile pre-fills all your answers so
it's non-interactive (just press Enter through the prompts).

```bash
npx github:abhisekmazumdar/drupal-contrib-claude-skills
```

**If you cloned locally:** pull first, then re-run:

```bash
git -C /path/to/drupal-claude-skills pull
npx /path/to/drupal-claude-skills
```

All package files (skills, agents, CLAUDE.md, settings.json) are always updated to the latest version. Your own custom files in `.claude/skills/` are never touched.

## Repository layout

```
drupal-claude-skills/
  bin/
    setup.js              # setup entry point (run via: npx github:abhisekmazumdar/drupal-contrib-claude-skills)
  skills/                 # skill directories — copied as-is to .claude/skills/
  agents/                 # agent files — copied as-is to .claude/agents/
  templates/
    CLAUDE.md.template    # rendered with project-specific vars at install time
    settings.json.template  # rendered with project-specific vars at install time
  package.json
  README.md
  CLAUDE.md               # guidance for Claude Code when working on this repo
```

Skills and agents are **never** rendered with template vars — they are copied verbatim and read project paths from the installed `CLAUDE.md` context at runtime. Only `templates/` files receive `{{VAR}}` substitution.

## License

MIT
