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
GITLAB_HOST=git.drupalcode.org glab auth status --hostname git.drupalcode.org
```

If either command fails, stop and tell the user that `glab` must be installed and authenticated for `git.drupalcode.org` before proceeding.

When unsure of a flag or subcommand, use `glab --help` or `glab <subcommand> --help` — always prefer live help output over guessing.

---

## Two hostnames — never mix them

| Purpose | Hostname |
|---------|----------|
| HTTP operations — `glab` commands, API reads/writes, web UI | `git.drupalcode.org` |
| SSH git operations — push, fetch, clone | `git.drupal.org` |

Using the wrong hostname for API writes causes silent failures: requests redirect and downgrade to GET, returning `HTTP 200` instead of `201 Created`.

```bash
# glab commands always use git.drupalcode.org
GITLAB_HOST=git.drupalcode.org glab issue list -R project/<repo>

# SSH remotes always use git.drupal.org
git remote add <project>-<issue-id> git@git.drupal.org:issue/<project>-<issue-id>.git
```

Read the token for direct API calls:
```bash
TOKEN=$(glab config get token --host git.drupalcode.org)
```

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

Issue state is tracked via **scoped labels**, not a status widget:

| State | Label |
|-------|-------|
| In progress | *(no label — MR open and assigned)* |
| Changes requested | `state::needsWork` |
| Awaiting review | `state::needsReview` |
| Ready to merge | `state::rtbc` |

Apply labels via `/do:label ~state::rtbc` comment or the GitLab label UI.

```bash
GITLAB_HOST=git.drupalcode.org glab issue list   -R project/<repo>
GITLAB_HOST=git.drupalcode.org glab issue view <id> -R project/<repo>
GITLAB_HOST=git.drupalcode.org glab issue comment <id> -m "Message" -R project/<repo>
```

---

## Merge Requests (Cross-Project)

See [references/merge-requests.md](references/merge-requests.md) for full steps.

MRs go **from the issue fork to the upstream project**. `glab mr create` does not support cross-project MRs — use `glab api` directly.

**Check for an existing MR before creating one** (GitLab may auto-create one on push):
```bash
GITLAB_HOST=git.drupalcode.org glab mr list -R project/<repo>
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

---

## CI/CD

See [references/ci-cd.md](references/ci-cd.md) for full detail.

```bash
GITLAB_HOST=git.drupalcode.org glab ci status          # pipeline status for current branch
GITLAB_HOST=git.drupalcode.org glab ci view            # interactive view
GITLAB_HOST=git.drupalcode.org glab ci trace <job>     # stream full job log — use this to debug failures
```

**Note:** `glab ci run` does not work on git.drupalcode.org — pipeline triggers are blocked. Re-run CI by pushing a new commit (or `git commit --allow-empty`).

---

## `/do:` Commands

These comment commands are unique to git.drupalcode.org:

| Command | Effect |
|---------|--------|
| `/do:fork` | Provisions the issue fork and initial branch |
| `/do:access` | Grants your account push access to an existing fork |
| `/do:label ~state::rtbc` | Applies a label to the work item |
| `/do:assign @username` | Assigns the issue |

---

## Tips

- Add `--web` to any command to open the result in the browser
- Add `-o json` for JSON output when scripting
- Add `--yes` to skip confirmation prompts
- `-R project/<repo>` is sufficient when `GITLAB_HOST` is set — no need for the full `--repo "git.drupalcode.org/project/<repo>"` form
- Never `WebFetch` GitLab URLs — extract the IID and use `glab` instead
- Never mention contributors unprompted — state substance instead

---

## Gotchas

- **Two hostnames**: `git.drupalcode.org` for HTTP/API, `git.drupal.org` for SSH — mixing them causes silent failures or 404s
- **`glab mr create` cannot create cross-project MRs** — always use `glab api` for MRs on Drupal's issue-fork setup
- **Check for an existing MR before creating one** — GitLab may auto-create one when you push a branch
- **The fork must be provisioned via `/do:fork` or the Drupal.org UI before pushing** — pushing to a non-existent fork returns 404
- **`glab ci run` is blocked** — pipeline triggers are disabled on git.drupalcode.org; re-run CI by pushing
- **`glab issue comment` requires `-m`, not `--body`** — `note` is an alias for `comment`; do not add `create` as a subcommand
- **`By:` lines require Drupal.org usernames**, not GitLab usernames or email addresses
- **Issue state is via scoped labels**, not the work item status widget — use `/do:label ~state::rtbc` or the label UI
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
