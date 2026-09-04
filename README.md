# drupal-claude-skills

[![CI](https://github.com/abhisekmazumdar/drupal-contrib-claude-skills/actions/workflows/ci.yml/badge.svg)](https://github.com/abhisekmazumdar/drupal-contrib-claude-skills/actions/workflows/ci.yml)

Claude Code skills and agents for Drupal open source contribution. Run once from your workspace root to install everything you need to start working on Drupal.org issues with Claude Code.

📖 **[Full documentation](https://abhisekmazumdar.github.io/drupal-contrib-claude-skills/)** covers every skill and agent in depth, the review/approval workflow, multi-site support, and repo conventions. This README covers the basics: install, what you get, and how to use it.

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
- [`drupalorg-cli`](https://github.com/mglaman/drupalorg-cli) (`drupalorg`) on `PATH`
- [GitLab CLI](https://gitlab.com/gitlab-org/cli) (`glab`), authenticated against `git.drupalcode.org`

Two more skills — [playwright-cli](https://github.com/microsoft/playwright-cli) (browser e2e tests) and drupalorg-cli itself — are pulled from their upstream repos automatically at install time (needs network access on first run). See the [docs](https://abhisekmazumdar.github.io/drupal-contrib-claude-skills/#external-skills) for the full list of external skills.

## Installation

```bash
npx github:abhisekmazumdar/drupal-contrib-claude-skills
```

Add a shell alias so you don't have to remember it:

```bash
# add to ~/.zshrc or ~/.bashrc
alias drupal-claude-skills='npx --yes github:abhisekmazumdar/drupal-contrib-claude-skills'
```

Prefer a pinned copy (offline reuse, a specific commit, or editing the skills yourself)? Clone it and point `npx` at the local path instead:

```bash
git clone git@github.com:abhisekmazumdar/drupal-contrib-claude-skills.git /path/to/drupal-claude-skills
npx /path/to/drupal-claude-skills
```

The script works with Drupal at your workspace root, or in a subdirectory (e.g. `my-workspace/drupal/`) — it auto-detects which layout you have. It then asks a few questions (project location, DDEV project name, site URL, PHP/MariaDB version), all with sensible defaults, saved to `.claude/claude-skills.lock.json` so re-runs are non-interactive. Full walkthrough and both supported layouts are in the [docs](https://abhisekmazumdar.github.io/drupal-contrib-claude-skills/#installation).

Re-running is always safe — files only in the destination (your own custom skills) are never touched; all package files are updated to the latest version.

## After installation

Open the workspace in Claude Code and paste a Drupal.org or GitLab work-item issue URL, or run the entry point directly:

```
/drupal-issue-start https://www.drupal.org/project/ai/issues/3499692
```

This loads any prior work from `issues/<nid>/README.md`, fetches live issue state (every open MR, all comments), gives it a light preliminary read, and leads with a verdict — RTBC-ready, close with a named gap, needs work, or needs discussion — before asking what you want to do. From there it delegates to whichever agent the job needs:

| Agent | What it does |
|---|---|
| `drupal-issue-agent` | Full review, implementation, and fix loop — the only one that edits module code |
| `drupal-repo-setup` | Locates/clones the module, installs missing dependencies via Composer, checks out the MR branch or creates a worktree |
| `drupal-e2e-tester` | Dedicated test phase — PHPUnit via DDEV plus Playwright browser e2e — report-only, never edits code |
| `drupal-issue-catchup` | Re-briefs you on an issue after time away, diffing new activity against the local record |

Agents pause at every approval gate — nothing is written, edited, `composer require`'d, committed, or posted without your explicit go-ahead. See the [docs](https://abhisekmazumdar.github.io/drupal-contrib-claude-skills/#agents) for what each agent does in detail, and the [skills catalog](https://abhisekmazumdar.github.io/drupal-contrib-claude-skills/#skills) for everything else installed.

Every issue you work on gets a persistent record at `issues/<nid>/README.md` — the long-term memory for contribution work, read at the start of every session.

## Updating

**Installed via `npx github:...`:** just re-run the same command — it fetches the current `main` branch each time.

**Cloned locally:** `git -C /path/to/drupal-claude-skills pull`, then re-run `npx /path/to/drupal-claude-skills`.

## Repository layout

```
drupal-claude-skills/
  bin/setup.js            # CLI entry point
  skills/                 # skill directories — copied as-is to .claude/skills/
  agents/                 # agent files — copied as-is to .claude/agents/
  templates/              # CLAUDE.md.template, settings.json.template — {{VAR}} substituted at install time
  docs/                   # full documentation (GitHub Pages)
  CLAUDE.md               # guidance for Claude Code when working on this repo
```

## License

MIT
