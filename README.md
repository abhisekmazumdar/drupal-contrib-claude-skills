# drupal-claude-skills

[![CI](https://github.com/abhisekmazumdar/drupal-contrib-claude-skills/actions/workflows/ci.yml/badge.svg)](https://github.com/abhisekmazumdar/drupal-contrib-claude-skills/actions/workflows/ci.yml)

Claude Code skills and agents for Drupal open source contribution. Run once from your workspace root to install everything you need to start working on Drupal.org issues with Claude Code.

📖 **[Full documentation](https://abhisekmazumdar.github.io/drupal-contrib-claude-skills/)** — every skill and agent, the review/approval workflow, multi-site support, issue-record format, and repo conventions.

## Quickstart

```bash
npx github:abhisekmazumdar/drupal-contrib-claude-skills
```

Requirements: [Node.js](https://nodejs.org) 18+, [Claude Code](https://claude.ai/code), a running DDEV Drupal project, [`drupalorg-cli`](https://github.com/mglaman/drupalorg-cli) and an authenticated [GitLab CLI](https://gitlab.com/gitlab-org/cli) (`glab`) on `PATH`.

The script asks a few questions (project location, DDEV project name, site URL, PHP/MariaDB version) — all with sensible defaults, saved to `.claude/claude-skills.lock.json` so re-runs are non-interactive. See the [docs](https://abhisekmazumdar.github.io/drupal-contrib-claude-skills/#installation) for the full walkthrough, supported project layouts, and what gets installed.

Prefer a pinned copy? Clone it and point `npx` at the local path instead:

```bash
git clone git@github.com:abhisekmazumdar/drupal-contrib-claude-skills.git /path/to/drupal-claude-skills
npx /path/to/drupal-claude-skills
```

## After installation

Open the workspace in Claude Code and paste a Drupal.org or GitLab work-item issue URL, or run the entry point directly:

```
/drupal-issue-start https://www.drupal.org/project/ai/issues/3499692
```

This loads any prior work, fetches live issue state, and routes to the right agent — see [Agents](https://abhisekmazumdar.github.io/drupal-contrib-claude-skills/#agents) in the docs for what each one does and [Skills](https://abhisekmazumdar.github.io/drupal-contrib-claude-skills/#skills) for the full catalog. Every issue you work on gets a persistent record at `issues/<nid>/README.md`.

## Updating

Re-run the same install command — `npx` fetches the current `main` branch each time (or `git pull` first if you cloned locally). All package files are always updated to the latest version; your own custom files in `.claude/skills/` are never touched.

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

See the [full documentation](https://abhisekmazumdar.github.io/drupal-contrib-claude-skills/) for details on every skill, agent, and convention this package uses.

## License

MIT
