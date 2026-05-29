# drupal-claude-skills

Claude Code skills and agent for Drupal open source contribution. Run once from any Drupal project root to install everything you need to start working on Drupal.org issues with Claude Code.

## What gets installed

- **15 skills** in `.claude/skills/` covering DDEV, PHPCS/PHPCBF, PHPUnit, GitLab MR workflow, drupalorg-cli, Playwright, and more
- **1 agent** in `.claude/agents/drupal-issue-agent.md` — give it a Drupal.org or GitLab work-item URL and it handles the full issue lifecycle end-to-end
- **CLAUDE.md** at your project root — pre-filled with your DDEV project name, site URL, and stack details
- **`.claude/settings.json`** — pre-configured Claude Code permissions for all the tools the agent uses

## Requirements

- [Node.js](https://nodejs.org) 18 or later (for `npx`)
- [Claude Code](https://claude.ai/code) installed and authenticated
- A running DDEV Drupal project (or any Drupal project root)
- The following CLI tools installed and on PATH:
  - [`drupalorg-cli`](https://github.com/mglaman/drupalorg-cli) (`drupalorg`)
  - [GitLab CLI](https://gitlab.com/gitlab-org/cli) (`glab`) — authenticated against `git.drupalcode.org`

## Installation

### Public repo

Run this from your Drupal project root (the directory containing `web/` and `composer.json`):

```bash
npx github:YOUR-GITHUB-USER/drupal-claude-skills
```

### Private repo

`npx github:…` cannot authenticate against a private repository. Clone the repo once and run the script directly instead:

```bash
git clone git@github.com:abhisekmazumdar/drupal-contrib-claude-skills.git ~/drupal-claude-skills
```

Then from any Drupal project root:

```bash
node ~/drupal-claude-skills/bin/setup.js
```

You can wrap that in a shell alias to keep it short:

```bash
# add to ~/.zshrc or ~/.bashrc
alias drupal-claude-skills='node ~/drupal-claude-skills/bin/setup.js'
```

---

The script will ask four questions — all have sensible defaults:

```
DDEV project name [my-drupal-project]:
Site URL [https://my-drupal-project.ddev.site]:
PHP version [8.4]:
MariaDB version [11.8]:
```

Press Enter to accept a default, or type a custom value.

### Options

| Flag | Effect |
|---|---|
| `--force` | Overwrite existing skill/agent files and `.claude/settings.json` without prompting |

### What happens

1. `.claude/skills/` is created (or merged) with all 15 skills
2. `.claude/agents/drupal-issue-agent.md` is installed
3. `.claude/settings.json` is written with pre-approved permissions
4. `CLAUDE.md` is generated with your project details substituted in — if one already exists, you are asked before it is overwritten

Files that already exist are **skipped by default** so re-running is safe. Use `--force` to update everything.

## After installation

Open the project in Claude Code and paste a Drupal.org issue URL:

```
https://www.drupal.org/project/ai/issues/3499692
```

The `drupal-issue-agent` picks it up automatically. It fetches the issue, lists any MRs, and presents a triage card before doing anything. From there you can ask it to review an existing MR, implement a fix, or draft a Drupal.org comment.

GitLab work-item URLs are also supported:

```
https://git.drupalcode.org/project/ai/-/work_items/3499692
```

## Updating

Pull the latest changes and re-run the script. Existing files are skipped, so only new skills or agents are added:

```bash
git -C ~/drupal-claude-skills pull
node ~/drupal-claude-skills/bin/setup.js
```

To also update existing skill files, add `--force`:

```bash
node ~/drupal-claude-skills/bin/setup.js --force
```

## Repository layout

```
drupal-claude-skills/
  bin/
    setup.js          # the npx entry point
  skills/             # 15 skill directories copied to .claude/skills/
  agents/
    drupal-issue-agent.md
  templates/
    CLAUDE.md.template
    settings.json.template
  package.json
  README.md
```

## License

MIT
