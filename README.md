# drupal-claude-skills

Claude Code skills and agents for Drupal open source contribution. Run once from your workspace root to install everything you need to start working on Drupal.org issues with Claude Code.

## What gets installed

- **Skills** in `.claude/skills/` covering DDEV, PHPCS/PHPCBF, PHPUnit, GitLab MR workflow, drupalorg-cli, Playwright, and more
- **Agents** in `.claude/agents/` — give the issue agent a Drupal.org or GitLab work-item URL and it handles the full issue lifecycle end-to-end
- **CLAUDE.md** at your workspace root — pre-filled with your DDEV project name, site URL, stack details, and correct module paths
- **`.claude/settings.json`** — pre-configured Claude Code permissions for all the tools the agents use

## Requirements

- [Node.js](https://nodejs.org) 18 or later (for `npx`)
- [Claude Code](https://claude.ai/code) installed and authenticated
- A running DDEV Drupal project
- The following CLI tools installed and on PATH:
  - [`drupalorg-cli`](https://github.com/mglaman/drupalorg-cli) (`drupalorg`)
  - [GitLab CLI](https://gitlab.com/gitlab-org/cli) (`glab`) — authenticated against `git.drupalcode.org`

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

Clone the repo once:

```bash
git clone git@github.com:abhisekmazumdar/drupal-contrib-claude-skills.git ~/drupal-claude-skills
```

Then from your workspace root:

```bash
node ~/drupal-claude-skills/bin/setup.js
```

Add a shell alias to keep it short:

```bash
# add to ~/.zshrc or ~/.bashrc
alias drupal-claude-skills='node ~/drupal-claude-skills/bin/setup.js'
```

---

The script asks a few questions — all have sensible defaults:

```
Where is your Drupal project? [drupal (auto-detected)]:

DDEV project name [my-drupal-project]:
Site URL [https://my-drupal-project.ddev.site]:
PHP version [8.4]:
MariaDB version [11.8]:

Install Playwright skills? [y/N]:
```

- The Drupal project location is asked **first** so the DDEV project name can be auto-detected from `.ddev/config.yaml` in that directory.
- If Drupal is at the workspace root, the location question is skipped entirely.
- Press Enter to accept any default, or type a custom value.

### What happens

1. `.claude/skills/` is created (or updated) with all package skills
2. `.claude/agents/` is created (or updated) with all agents
3. `.claude/settings.json` is written with pre-approved permissions
4. `CLAUDE.md` is generated at the workspace root with your project details and paths substituted in

Re-running is always safe — files only in the destination (your own custom skills) are never touched. All package files are updated to the latest version.

### Playwright skills (optional)

Answer `y` to the Playwright question to also install:
- `playwright-cli` — browser automation skill
- `issue-record-screenshot` — capture screenshots into `issues/<nid>/screenshots/`

Requires: `npm install -g @playwright/cli@latest`

## After installation

Open the workspace in Claude Code and paste a Drupal.org issue URL:

```
https://www.drupal.org/project/ai/issues/3499692
```

Or run the entry point skill directly:

```
/drupal-issue-start https://www.drupal.org/project/ai/issues/3499692
```

The skill loads any prior work from `issues/<nid>/README.md`, fetches live issue state, and presents a structured report before doing anything. From there it delegates to the `drupal-issue-agent` for review, implementation, or drafting a Drupal.org comment.

GitLab work-item URLs are also supported:

```
https://git.drupalcode.org/project/ai/-/work_items/3499692
```

## Issue tracking

Every issue you work on gets a persistent record at `issues/<nid>/README.md`. This is the long-term memory for contribution work — it survives across sessions and is read at the start of every session.

```
issues/
└── 3499692/
    ├── README.md         ← summary, work log, notes
    └── screenshots/      ← Playwright screenshots
```

## Updating

Pull the latest changes and re-run the script:

```bash
git -C ~/drupal-claude-skills pull
node ~/drupal-claude-skills/bin/setup.js
```

All package files (skills, agents, CLAUDE.md, settings.json) are always updated to the latest version. Your own custom files in `.claude/skills/` are never touched.

## Repository layout

```
drupal-claude-skills/
  bin/
    setup.js              # setup entry point
  skills/                 # skill directories — copied to .claude/skills/
  agents/                 # agent files — copied to .claude/agents/
  templates/
    CLAUDE.md.template    # rendered with project-specific vars at install time
    settings.json.template
  package.json
  README.md
```

## License

MIT
