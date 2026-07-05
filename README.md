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
- Optional: [Playwright](https://playwright.dev) for the browser-based e2e test phase (`drupal-e2e-tester`):
  ```bash
  npm i -D @playwright/test && npx playwright install chromium
  ```

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

Clone the repo to wherever you keep tools — the path you choose is the path you use:

```bash
git clone git@github.com:abhisekmazumdar/drupal-contrib-claude-skills.git /path/to/drupal-claude-skills
```

Then from your workspace root, pass that same path to `npx`:

```bash
npx /path/to/drupal-claude-skills
```

Add a shell alias so you don't have to remember the path:

```bash
# add to ~/.zshrc or ~/.bashrc
alias drupal-claude-skills='npx /path/to/drupal-claude-skills'
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
2. `.claude/agents/` is created (or updated) with all agents
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

The skill loads any prior work from `issues/<nid>/README.md`, fetches live issue state, and presents a structured report before doing anything. From there it delegates to the `drupal-issue-agent` for review, implementation, or drafting a Drupal.org comment, and to the `drupal-e2e-tester` agent for the dedicated test phase (PHPUnit via DDEV plus Playwright browser e2e). Agents pause at every approval gate — the skill relays each pause report back to you and nothing is written, committed, or posted without your explicit go-ahead.

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

Pull the latest changes and re-run — the lockfile pre-fills all your answers:

```bash
git -C /path/to/drupal-claude-skills pull
npx /path/to/drupal-claude-skills
```

All package files (skills, agents, CLAUDE.md, settings.json) are always updated to the latest version. Your own custom files in `.claude/skills/` are never touched.

## Repository layout

```
drupal-claude-skills/
  bin/
    setup.js              # setup entry point (run via: npx ~/drupal-claude-skills)
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
