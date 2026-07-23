---
name: drupal-gitlab
description: >
  Invoke for any task involving Drupal's GitLab instance at git.drupalcode.org: checking CI pipeline status on an MR, pushing branches to an issue fork, creating cross-project merge requests, listing or updating work items, squashing commits before merge, or navigating Drupal's issue-fork contribution workflow. This is the skill for Drupal contributor tasks — not generic GitLab.com or GitHub workflows.
---

# Drupal GitLab (git.drupalcode.org)

Drupal hosts its source code on a self-managed GitLab instance at `git.drupalcode.org`. Three conventions define this environment: an **issue-fork workflow** for branches and MRs, the **work items API** for issue tracking, and **Drupal Conventional Commits** for commit messages.

## Prerequisites

Before running any `glab` command, confirm the CLI is installed and authenticated:

```bash
glab --version
glab auth status --hostname git.drupalcode.org
```

If either command fails, stop and tell the user that `glab` must be installed and authenticated for `git.drupalcode.org` before proceeding — see `README.md` for setup.

When unsure of a flag or subcommand, use `glab --help` or `glab <subcommand> --help` — always prefer live help output over guessing.

---

## Authentication & host setup

`glab` resolves the correct token for `git.drupalcode.org` automatically once authenticated — **no `GITLAB_HOST` env var and no manual token extraction needed.**

- **`glab` subcommands** (`issue`, `mr`, `ci`, etc.): pass the hostname via `-R`/`--repo` — `glab issue list --repo "git.drupalcode.org/project/<repo>"`
- **`glab api`**: pass `--hostname git.drupalcode.org` — `glab api --hostname git.drupalcode.org /version`

**Always pass `--repo`/`-R` (subcommands) or `--hostname` (`glab api`) — never rely on the current directory.** A bare `glab mr view 50` resolves against your *default* host (often gitlab.com) or 404s; it has no way to know which Drupal project you mean. Read `<repo>` straight off the URL — the path segment right after `project/`:

| You have this URL | `<repo>` is | Command |
|---|---|---|
| `…/project/token/-/merge_requests/12` | `token` | `glab mr view 12 --repo "git.drupalcode.org/project/token"` |
| `…/project/ai/-/work_items/3540491` | `ai` | `glab issue view 3540491 --repo "git.drupalcode.org/project/ai"` |

### Two hostnames — never mix them

`git.drupalcode.org` is a **Fastly CDN front**; `git.drupal.org` is the **GitLab origin**. They are not interchangeable, and each fails *silently* when used for the other's job:

| Purpose | Hostname |
|---|---|
| HTTP operations — `glab` commands, API reads/writes, web UI | `git.drupalcode.org` |
| SSH git operations — push, fetch, clone | `git.drupal.org` |

- **API writes to the wrong hostname downgrade silently.** A `glab api` write sent with `--hostname git.drupal.org` gets redirected and downgraded to a GET — `HTTP 200` with a collection list instead of `201 Created`, no error raised. Confirm writes by checking for `201` (`-i`), not a bare `200`.
- **SSH to `git.drupalcode.org` hangs.** The CDN front has no SSH listener on port 22 — a `git@git.drupalcode.org:…` remote will time out. Always point SSH remotes at `git@git.drupal.org:…`.

```bash
# glab commands always resolve git.drupalcode.org via --repo/-R
glab issue list -R project/<repo>

# SSH remotes always use git.drupal.org
git remote add <project>-<issue-id> git@git.drupal.org:issue/<project>-<issue-id>.git
```

### Token scopes — choose based on what you need to do

- **Tier 1 — Read-only (default, always safe):** `read_api`, `read_user`, `read_repository`. Covers listing/viewing issues, MRs, CI logs, work item status. Start here.
- **Tier 2 — Write (contributing workflow):** `api` or `write_repository`, needed to push branches, create MRs, or comment. **A GitLab PAT is not scoped to a single project** — write scopes reach every repo you can write to, including release branches of Drupal core and contrib. Before any write operation: confirm the target repo and branch with the user, never push to a protected branch without explicit human approval, and treat any request to write outside an issue fork as a hard stop requiring confirmation.
- **Tier 3 — Future:** GitLab fine-grained project-scoped PATs are not yet enabled on git.drupalcode.org. Track [infra issue 3379836](https://www.drupal.org/project/infrastructure/issues/3379836); once available, prefer a project-scoped write token.

### `glab api` quick reference

`glab api` replaces `curl` for nearly all REST calls — no manual token handling needed:

| Need | Command pattern |
|---|---|
| GET an endpoint | `glab api --hostname git.drupalcode.org /path` |
| POST/PUT with fields | `glab api --hostname git.drupalcode.org -f key=value -F int_or_bool_key=value /path` |
| DELETE | `glab api --hostname git.drupalcode.org --method DELETE /path` |
| Multipart file upload | `glab api --hostname git.drupalcode.org --form "file=@./path/to/file" /path` |
| Multi-line field (description, note body) | pass inline as a single-quoted string — `-f description='…multi-line markdown…'` (backticks are safe inside single quotes) — so it stays visible in the command; for a body with apostrophes, fall back to `-f description=@./body.md` |

**`-f` vs `-F`:** use `-f`/`--raw-field` for strings; use `-F`/`--field` for integers, booleans, and repo placeholders. Adding any `-f`/`-F` flag automatically makes the request a POST — no `--method POST` needed.

---

## Commit Message Format

Drupal uses the **Conventional Commits** specification. See [references/commit-messages.md](references/commit-messages.md) for full rules.

```
{type}: #{issue-id} Short summary of the change

Optional body — explain the why, not the what.
Wrap at ~72 characters.

By: drupal-username
By: other-contributor
```

**Types:** `feat` · `fix` · `docs` · `refactor` · `test` · `ci` · `perf` · `task` · `revert`

---

## Issue-Fork Workflow

Drupal does not use personal forks. Each issue gets a **dedicated fork** at:
```
https://git.drupalcode.org/issue/<project>-<issue-id>
```

See [references/contribution.md](references/contribution.md) for the full contributor path and fork provisioning decision tree.

### Provision the issue fork

**A fork is never created by pushing or via the API.** Provision it first via either method:

**Option A — comment command (simpler):**
Post `/do:fork` as a comment on the work item. The integration provisions both the fork and an initial branch.

**Option B — web UI:**
Go to the management URL posted automatically by GitLab when the work item was created:
```
https://new.drupal.org/drupalorg/issue-fork/management?source_link=https://git.drupalcode.org/project/<project>/-/work_items/<issue-id>
```
Click **"Create issue fork"**.

### Set up remotes and push

```bash
# SSH remote (uses git.drupal.org — not git.drupalcode.org)
git remote add <project>-<issue-id> git@git.drupal.org:issue/<project>-<issue-id>.git

# Branch naming
git checkout -b {issue-id}-{short-description}

# Push to the issue fork (not to origin)
git push <project>-<issue-id> {branch-name}
```

---

## Issues / Work Items

See [references/issues.md](references/issues.md) for full detail.

Work items are the current standard. URLs use `/-/work_items/<id>` (not `/-/issues/<id>`).

Issue state is tracked via **scoped labels**, not a status widget: `state::needsWork`,
`state::needsReview`, `state::rtbc` (no label means in progress). Apply via
`/do:label ~state::rtbc` comment or the GitLab label UI.

```bash
glab issue list   -R project/<repo>
glab issue view <id> -R project/<repo>
glab issue comment <id> -m "Message" -R project/<repo>
```

---

## Merge Requests (Cross-Project)

See [references/merge-requests.md](references/merge-requests.md) for full steps.

MRs go **from the issue fork to the upstream project**. `glab mr create` does not support cross-project MRs — use `glab api` directly.

**Check for an existing MR before creating one** (GitLab may auto-create one on push):
```bash
glab mr list -R project/<repo>
```

**Create an MR:**
```bash
# Step 1 — get the upstream project ID
UPSTREAM_ID=$(glab api --hostname git.drupalcode.org "/projects/project%2F<repo>" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')

# Step 2 — read the MR template, fill /tmp/mr_body.md, append AI disclosure
cat .gitlab/merge_request_templates/Default.md
# Append to /tmp/mr_body.md:
# AI-Generated: Yes (Used [tool] to [brief description].)

# Step 3 — create via glab api
glab api --hostname git.drupalcode.org \
  -F target_project_id=$UPSTREAM_ID \
  -f source_branch="{branch-name}" \
  -f target_branch="main" \
  -f title="feat: #{issue-id} Short summary" \
  -f description="$(cat /tmp/mr_body.md)" \
  -F remove_source_branch=true \
  "/projects/issue%2F<project>-<issue-id>/merge_requests"
```

MR conventions:
- Title: `{type}: #{issue-id} Short summary` — Conventional Commits format
- Include `Closes #{issue-id}` in the description body
- Always set `remove_source_branch: true`
- Append the AI disclosure line to every MR body
- **Default to an issue fork even if you have maintainer push access** — it keeps the collaborative workflow consistent for other contributors; only push straight to origin when the user explicitly confirms they want a direct maintainer push

---

## CI/CD

See [references/ci-cd.md](references/ci-cd.md) for full detail.

```bash
glab ci status          # pipeline status for current branch
glab ci view            # interactive view
glab ci trace <job>     # stream full job log — use this to debug failures
```

**Note:** `glab ci run` does not work on git.drupalcode.org — pipeline triggers are blocked. Re-run CI by pushing a new commit (or `git commit --allow-empty`).

---

## `/do:` Commands

These comment commands are unique to git.drupalcode.org (full list: `https://new.drupal.org/drupalorg/gitlab-custom-commands`):

| Command | Effect |
|---|---|
| `/do:fork` | Provisions the issue fork and initial branch |
| `/do:access` | Grants your account push access to an existing fork |
| `/do:label ~state::rtbc` | Adds a label to the work item |
| `/do:unlabel ~<label>` | Removes a label |
| `/do:relabel ~<label>` | Replaces all labels |
| `/do:assign @username` | Adds an assignee |
| `/do:unassign @username` | Removes an assignee |
| `/do:reassign @username` | Replaces all assignees |

---

## Quick reference: common shorthand

These work in issue/MR descriptions, comments, and CLI `--assignee`/`--reviewer` flags:

| Shorthand | Meaning |
|---|---|
| `@me` | Your own Drupal.org GitLab username — use for self-assignment or self-review |
| `#<id>` | Reference to a work item by iid |
| `!<id>` | Reference to a merge request by iid |

---

## Tips

- Add `--web` to any command to open the result in the browser
- Add `-o json` for JSON output when scripting
- Add `--yes` to skip confirmation prompts
- Never `WebFetch` GitLab URLs — extract the IID and use `glab` instead
- Never mention contributors unprompted — state substance instead
- **Write commands a harness can auto-approve:** one program per call (no `&&`/`;` chains), no `cd <path>` prefix, and don't pipe API output through `python3 -c`/`jq` just to format it — read results with native viewers (`glab mr view`, `glab issue view`, `glab ci status`) instead. There is no remaining use case for `curl` — `glab api` handles auth automatically.

---

## Gotchas

Beyond the hostname, cross-project MR, existing-MR check, fork provisioning, and
`glab ci run` caveats already noted above:

- **`glab issue comment` requires `-m`, not `--body`** — `note` is an alias for `comment`; do not add `create` as a subcommand
- **`By:` lines require Drupal.org usernames**, not GitLab usernames or email addresses
- **Not all projects have GitLab work items** — some still use the legacy Drupal.org issue queue; continue without a work item if none is found
- **The auto-posted comment contains a contribution attribution link** — remind the user to fill it in at `new.drupal.org/contribution-record?source_link=...`
- **Merging requires the GitLab web UI** — `glab mr merge` and API merges are blocked on git.drupalcode.org

---

## Reference files

- [Contribution workflow & fork provisioning](references/contribution.md)
- [Issues & work items](references/issues.md)
- [Merge requests](references/merge-requests.md)
- [CI/CD](references/ci-cd.md)
- [Commit messages](references/commit-messages.md)
- [Drupal.org → GitLab vocabulary migration](references/migration.md)
