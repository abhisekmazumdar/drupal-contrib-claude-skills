---
name: drupal-gitlab
description: Use GitLab CLI and API to manage issues, merge requests, and branches on git.drupalcode.org — including Drupal's issue-fork workflow, work items API, and Conventional Commits format.
---

# Drupal GitLab (git.drupalcode.org)

Drupal hosts its source code on a self-managed GitLab instance at `git.drupalcode.org`. This skill is designed for that environment. Its three key conventions are: an **issue-fork workflow** for branches and MRs, the **work items API** for issue tracking, and **Drupal Conventional Commits** for commit messages.

## Prerequisites

Before running any `glab` command, confirm the CLI is installed and authenticated:

```bash
# Confirm glab is installed
glab --version

# Confirm authentication to git.drupalcode.org
GITLAB_HOST=git.drupalcode.org glab auth status --hostname git.drupalcode.org
```

If either command fails, stop and inform the user that `glab` must be installed and authenticated for `git.drupalcode.org` before this skill can be used. Direct them to `skills/drupal-gitlab/README.md` for installation and authentication instructions.

When unsure of a flag or subcommand, use `glab --help` or `glab <subcommand> --help` (e.g. `glab mr merge --help`) — always prefer live help output over guessing.

See Authentication & Host Setup below for how to use the host variable in commands.

---

## Authentication & Host Setup

The token for `git.drupalcode.org` is stored separately from other GitLab hosts. Always prefix API calls with the correct host — never change the global default.

`GITLAB_HOST` sets the target instance for all glab commands. `--hostname` is additionally required for `glab api` and `glab auth` subcommands that do not inherit the env var — always pass both for those commands.

```bash
# All subsequent glab commands: use the env var to target drupalcode.org
GITLAB_HOST=git.drupalcode.org glab issue list --repo "git.drupalcode.org/<namespace>/<repo>"
```

Read the token for direct API/curl calls:
```bash
TOKEN=$(glab config get token --host git.drupalcode.org)
```

---

## Commit Message Format

Drupal uses the **Conventional Commits** specification. Every commit must follow this format:

```
{type}: #{issue-id} Short summary of the change

Optional body — explain the why, not the what.
Wrap at ~72 characters.

By: drupal-username
By: other-contributor
```

**Types:** `feat` · `fix` · `docs` · `refactor` · `test` · `ci` · `perf` · `task` · `revert`

**Rules:**
- The issue ID is the last segment of the issue URL (e.g. `3586461` from `/-/work_items/3586461`). The numeric ID is identical whether sourced from drupal.org (e.g. `drupal.org/project/foo/issues/3586461`) or from GitLab — no conversion needed.
- `By:` lines use **Drupal.org usernames**, not GitLab names and not `@username` syntax
- Use `By:` for all contributors (author, reviewer, reporter) — maintainers may also use `Co-authored-by:`, `Reviewed-by:`, or `Reported-by:` for specificity

```
feat: #0000001 Add standardized commit message format

By: drupal-username
```

---

## Issue-Fork Workflow

Drupal does not use personal forks. Instead, each issue gets a **dedicated fork** provisioned through the Drupal.org issue management page. The fork lives at:

```
https://git.drupalcode.org/issue/<project>-<issue-id>
```

### Step 1 — Provision the issue fork (required before pushing)

After a work item is created, GitLab automatically posts a comment containing two links:

- **Attribute your contribution:**
  `https://new.drupal.org/contribution-record?source_link=https://git.drupalcode.org/project/<project>/-/work_items/<issue-id>`
- **Manage forks, branches, and MRs:**
  `https://new.drupal.org/drupalorg/issue-fork/management?source_link=https://git.drupalcode.org/project/<project>/-/work_items/<issue-id>`

Go to the **management URL** and click **"Create issue fork"**. This provisions the fork repository at `https://git.drupalcode.org/issue/<project>-<issue-id>`.

**The fork cannot be created by pushing or via the API** — it must be provisioned through this Drupal.org UI page first.

### Step 2 — Set up remotes and push

Your local repo will have two remotes after the fork is provisioned:

```
origin                  https://git.drupalcode.org/project/<project>.git          ← upstream
<project>-<issue-id>    https://git.drupalcode.org/issue/<project>-<issue-id>.git ← issue fork
```

**Branch naming:**
```
{issue-id}-{short-description}   # e.g. {issue-id}-add-issue-templates
```

**Push to the issue fork** (not to origin):
```bash
# SSH
git push <project>-<issue-id> {branch-name}

# HTTPS (if SSH is unavailable)
TOKEN=$(glab config get token --host git.drupalcode.org)
git push "https://{username}:${TOKEN}@git.drupalcode.org/issue/<project>-<issue-id>.git" {branch-name}
```

---

## Issues / Work Items

Drupal.org is transitioning all projects from its proprietary issue queue to GitLab work items. **Work items is the current, preferred method** and all new projects use it. However, some projects still rely on the legacy Drupal.org issue queue and may not have a GitLab work item for every branch or MR. Do not require a work item to exist — if none is found, continue without one and inform the user.

Issue URLs use `/-/work_items/<id>` (not `/-/issues/<id>`). Use `glab issue create` as normal — it will create a work item automatically.

**Look up issue templates:**
```bash
ls .gitlab/issue_templates/
cat ".gitlab/issue_templates/<TemplateName>.md"
```

**Create an issue** (`--label` is optional; check available project labels first with `glab label list`):
```bash
GITLAB_HOST=git.drupalcode.org glab issue create \
  --title "Short descriptive title of the issue" \
  --description "$(cat /tmp/issue_body.md)" \
  --label "<label1>,<label2>" \
  --assignee "{username}" \
  --repo "git.drupalcode.org/project/<repo>"
```

**Common issue operations:**
```bash
GITLAB_HOST=git.drupalcode.org glab issue list   --repo "git.drupalcode.org/project/<repo>"
GITLAB_HOST=git.drupalcode.org glab issue view <id> --repo "git.drupalcode.org/project/<repo>"

# Post a comment — both forms work; -R project/<repo> is sufficient when GITLAB_HOST is set
GITLAB_HOST=git.drupalcode.org glab issue comment <id> -m "Message" -R project/<repo>
GITLAB_HOST=git.drupalcode.org glab issue note   <id> -m "Message" -R project/<repo>   # alias for comment
```

### Work Item Status (GraphQL)

Issue status ("To do" / "In progress" / "Done") is a work item widget, not a label. Read it via GraphQL:

```bash
# Read current status
GITLAB_HOST=git.drupalcode.org glab api graphql --hostname git.drupalcode.org -f query='
{
  project(fullPath: "<namespace>/<repo>") {
    workItems(iid: "<issue-iid>") {
      nodes {
        id
        widgets {
          ... on WorkItemWidgetStatus {
            type
            status { id name iconName }
          }
        }
      }
    }
  }
}'
```

System-defined status GIDs follow the pattern `gid://gitlab/WorkItems::Statuses::SystemDefined::Status/<n>` — query the current status first to confirm available IDs before attempting an update.

---

## Merge Requests (Cross-Project)

MRs go **from the issue fork to the upstream project**. `glab mr create` does not support cross-project MRs — use the REST API directly.

**Check for an existing MR before creating one:**
```bash
GITLAB_HOST=git.drupalcode.org glab mr list --repo "git.drupalcode.org/project/<repo>"

# View a specific MR
GITLAB_HOST=git.drupalcode.org glab mr view <mr-iid> --repo "git.drupalcode.org/project/<repo>"
```

**Step 1 — get the issue fork's project ID:**
```bash
TOKEN=$(glab config get token --host git.drupalcode.org)
SOURCE_ID=$(curl -s \
  --header "PRIVATE-TOKEN: $TOKEN" \
  "https://git.drupalcode.org/api/v4/projects/issue%2F<project>-<issue-id>" \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
```

**Step 2 — get the upstream project ID:**
```bash
TARGET_ID=$(curl -s \
  --header "PRIVATE-TOKEN: $TOKEN" \
  "https://git.drupalcode.org/api/v4/projects/project%2F<repo>" \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
```

**Step 3 — read the MR template and fill `/tmp/mr_body.md`:**
```bash
cat .gitlab/merge_request_templates/Default.md
```

Fill in the template, then append the required AI disclosure to the end of `/tmp/mr_body.md`:
```
AI-Generated: Yes (Used [tool] to [brief description of how AI was used].)
```
Drupal's [AI contribution policy](https://www.drupal.org/docs/develop/issues/issue-procedures-and-etiquette/policy-on-the-use-of-ai-when-contributing-to-drupal) requires this for any significant AI-assisted contribution. All MRs created via this skill qualify.

**Step 4 — build the JSON payload and create the MR:**
```bash
python3 -c "
import json
print(json.dumps({
  'source_project_id': $SOURCE_ID,
  'source_branch': '{branch-name}',
  'target_project_id': $TARGET_ID,
  'target_branch': 'main',
  'title': 'feat: #{issue-id} Short summary',
  'description': open('/tmp/mr_body.md').read(),
  'remove_source_branch': True
}))" > /tmp/mr_payload.json

curl -s --request POST \
  --header "PRIVATE-TOKEN: $TOKEN" \
  --header "Content-Type: application/json" \
  --data @/tmp/mr_payload.json \
  "https://git.drupalcode.org/api/v4/projects/issue%2F<project>-<issue-id>/merge_requests" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('web_url') or d)"
```

MR conventions:
- **Title**: `{type}: #{issue-id} Short summary` — Conventional Commits format
- **Always** set `remove_source_branch: true`
- **Target branch**: confirm with the user if not `main`

---

## CI/CD

```bash
GITLAB_HOST=git.drupalcode.org glab ci status                  # Pipeline status for current branch
GITLAB_HOST=git.drupalcode.org glab ci view                    # Interactive pipeline view
GITLAB_HOST=git.drupalcode.org glab ci trace <job-name>        # Stream full log of a job (best for debugging failures)
GITLAB_HOST=git.drupalcode.org glab ci run                     # Trigger a new pipeline
```

Use `glab ci trace <job-name>` as the primary tool for debugging pipeline failures — it streams the full job log. All other commands above are reference only.

---

## Tips

- Add `--web` to any command to open the result in the browser
- Add `-o json` for JSON output when scripting
- Add `--yes` to skip confirmation prompts
- The project namespace on drupalcode.org is always `project/<repo>` for the upstream and `issue/<repo>-<id>` for the issue fork

## Quick reference: common shorthand

These work in issue/MR descriptions, comments, and CLI `--assignee` / `--reviewer` flags:

| Shorthand | Meaning |
|-----------|---------|
| `@me` | Your own Drupal.org GitLab username — use for self-assignment or self-review |
| `#<id>` | Reference to a work item by iid |
| `!<id>` | Reference to a merge request by iid |

## Gotchas

- **`glab mr create` cannot create cross-project MRs** — always use the REST API for MRs on Drupal's issue-fork setup
- **Check for an existing MR before creating one** — GitLab may auto-create an MR when you push a branch. Query first with `glab mr list --repo ...` to avoid duplicates
- **SSH may be unavailable** in terminal/agent contexts — fall back to HTTPS with the token embedded in the remote URL
- **The issue fork must be provisioned via the Drupal.org UI before you can push** — after creating a work item, check the auto-posted comment for the management link (`https://new.drupal.org/drupalorg/issue-fork/management?source_link=...`). Click "Create issue fork" there. Pushing to a non-existent fork URL returns a 404; the fork API via curl/glab also does not work (Drupal's CDN returns 301 to `drupal.org/git-error`).
- **The auto-posted comment also contains a contribution attribution link** — `https://new.drupal.org/contribution-record?source_link=...` — remind the user to fill this in so maintainers can grant credit.
- **`glab issue comment` / `glab issue note` require `-m`, not `--body`** — `--body` is not a valid flag; always use `-m "Message"`. `note` is an alias for `comment` — both accept the same flags. Do not add `create` as a subcommand (`glab issue note <id>`, not `glab issue note create <id>`)
- **`-R project/<repo>` is sufficient when `GITLAB_HOST` is set** — the long form `--repo "git.drupalcode.org/project/<repo>"` also works, but the short `-R project/<repo>` avoids redundancy and is less error-prone
- **`By:` lines require Drupal.org usernames**, not GitLab usernames or email addresses — ask the user if unsure
- **Work item status cannot be set via labels** — it requires a GraphQL `workItemUpdate` mutation; if permissions are insufficient, inform the user and let them set it manually in the UI
- **Issue URLs use `/-/work_items/<id>`**, not `/-/issues/<id>` — use the iid (last URL segment) when calling the API
- **Not all projects have GitLab work items** — some still use the legacy Drupal.org issue queue. If `glab issue list` returns nothing, inform the user and continue without a work item.
