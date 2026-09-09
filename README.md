# drupal-claude-skills

[![CI](https://github.com/abhisekmazumdar/drupal-contrib-claude-skills/actions/workflows/ci.yml/badge.svg)](https://github.com/abhisekmazumdar/drupal-contrib-claude-skills/actions/workflows/ci.yml)

A shared Drupal contribution toolkit for Claude Code and Codex. Install it into your Drupal workspace to investigate issues, review merge requests, implement approved changes, run independent tests, and keep issue records across sessions.

[Full documentation](https://abhisekmazumdar.github.io/drupal-contrib-claude-skills/) covers the skills, agents, multi-site workflow, and [client compatibility](https://abhisekmazumdar.github.io/drupal-contrib-claude-skills/#clients).

The workflows support [Drupal.org's AI contribution policy](https://www.drupal.org/docs/develop/issues/issue-procedures-and-etiquette/policy-on-the-use-of-ai-when-contributing-to-drupal). You remain responsible for reviewing submissions, disclosing the actual assistants involved, and following up with maintainers.

## Requirements

- Node.js 18+ and Python 3 on the host.
- Claude Code, Codex CLI/IDE, or both, installed and authenticated.
- A DDEV Drupal workspace for local code checks and browser tests.
- [drupalorg-cli](https://github.com/mglaman/drupalorg-cli) on PATH, with PHP available to launch its MCP server.
- [glab](https://gitlab.com/gitlab-org/cli), authenticated against `git.drupalcode.org`.
- Network access for optional upstream skill downloads. Failures print manual installation commands.

Codex needs repository skills, standalone custom agents, and `PreToolUse` hooks. Local configuration/rule checks used Codex CLI 0.153.4; Claude Code 2.1.236 was present during development. This is not a claim that a live Drupal issue has been exercised end-to-end in either client. Cloud sessions without access to your DDEV environment cannot run its local tests.

## Install

Run from the Drupal workspace, not this package's source directory:

```bash
# Existing command stays compatible: defaults to Claude Code on first install
npx github:abhisekmazumdar/drupal-contrib-claude-skills

# Install for both clients
npx github:abhisekmazumdar/drupal-contrib-claude-skills --target both

# Or select one client
npx github:abhisekmazumdar/drupal-contrib-claude-skills --target codex
npx github:abhisekmazumdar/drupal-contrib-claude-skills --target claude-code

# Preview without writing or downloading
npx github:abhisekmazumdar/drupal-contrib-claude-skills --target both --dry-run
```

For a local checkout, use `npx /path/to/drupal-contrib-claude-skills --target both`.
Use `--yes` to accept detected defaults and `--skip-external` to skip upstream downloads.
The installer detects Drupal at the workspace root or in top-level subdirectories and records site settings for future runs.

## What gets installed

| Shared | Claude Code | Codex |
|---|---|---|
| `.drupal-contrib/context.md`: site table and workflow | `CLAUDE.md`: entry instructions | `AGENTS.md`: entry instructions |
| `.drupal-contrib/agents/`: complete role procedures | `.claude/agents/*.md` | `.codex/agents/*.toml` |
| Same source skills and helper scripts | `.claude/skills/` | `.agents/skills/` |
| Shared command guard logic | `.claude/settings.json` and hooks | `.codex/config.toml`, hooks, and rules |
| `.drupal-contrib/install.json`: settings and file ownership | `.mcp.json`: drupalorg-cli MCP | MCP entry in `.codex/config.toml` |

Only unchanged, package-owned files are automatically updated. Existing custom or edited files and symlinks are preserved; proposed replacements go under `.drupal-contrib/proposals/`. Review and merge these notices before using the installation. A legacy installation without ownership hashes may need this integration once. The old lockfile is retained and its answers are imported.

In Claude Code, approve the project MCP server when prompted and inspect it with `/mcp`.
In Codex, trust the workspace and review/trust the command hook through `/hooks`. Hooks awaiting trust do not protect commands.

## Use

Claude Code:

```text
/drupal-issue-start https://www.drupal.org/project/ai/issues/3499692
```

Codex CLI/IDE:

```text
$drupal-issue-start https://www.drupal.org/project/ai/issues/3499692
```

The entry skill loads prior context, fetches issue/MR activity, performs automatic local recon, and presents a verdict and next action. It delegates to four roles:

| Agent | Responsibility |
|---|---|
| Nora (`drupal-issue-agent`) | Review, implementation, and fixes |
| Wren (`drupal-repo-setup`) | Repository, branch, worktree, and dependency setup |
| Milo (`drupal-e2e-tester`) | Independent PHPUnit/Playwright testing; never fixes module code |
| Sage (`drupal-issue-catchup`) | Briefing on changes since the previous session |

Code/dependency changes, commits, and pushes require scoped approval. Recon and issue-record maintenance are documented automatic exceptions. Public comments are drafted for the human to post. Hooks and client permissions supplement these workflow instructions; they are not identical security boundaries across clients.

Both clients use `issues/<nid>/README.md` and archived `history.md`. You can resume an issue in the other client. Avoid concurrent writes to the same record or checkout.

## Update and develop

Re-run the installer to update package-owned files and install missing upstream skills. After adding another target, future runs without `--target` update all recorded targets. No target is uninstalled implicitly.

Use `npx skills update` for upstream skills; resolve any proposed `skills-lock.json` integration first, then re-run this installer to restore missing Codex invocation-policy metadata.

The package uses Node built-ins and has no build step:

```bash
node --check bin/setup.js
node --test tests/*.test.js
```

Tests require Python 3.11+ for TOML validation. CI also validates skill/agent frontmatter and template variables. Source lives in `skills/`, `agents/`, `templates/`, and `bin/`; the hand-written reference is `docs/index.html`.

## License

MIT
