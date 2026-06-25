# Merge Requests

MRs on Drupal GitLab flow **from the issue fork to the upstream project** (cross-project). `glab mr create` does not support cross-project MRs — use `glab api` directly.

---

## Before creating — check for an existing MR

GitLab may auto-create an MR when you push a branch. Always check first:

```bash
GITLAB_HOST=git.drupalcode.org glab mr list -R project/<repo>
GITLAB_HOST=git.drupalcode.org glab mr view <mr-iid> -R project/<repo>
```

---

## Creating a cross-project MR

### Step 1 — Read the MR template

```bash
cat .gitlab/merge_request_templates/Default.md
```

Fill in the template and save to `/tmp/mr_body.md`. Then append the required AI disclosure:

```
AI-Generated: Yes (Used [tool] to [brief description of how AI was used].)
```

Also include `Closes #{issue-id}` somewhere in the description body to auto-close the work item on merge.

### Step 2 — Get the upstream project ID

```bash
UPSTREAM_ID=$(glab api --hostname git.drupalcode.org \
  "/projects/project%2F<repo>" \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
```

### Step 3 — Create the MR via `glab api`

```bash
glab api --hostname git.drupalcode.org \
  -F target_project_id=$UPSTREAM_ID \
  -f source_branch="{branch-name}" \
  -f target_branch="main" \
  -f title="feat: #{issue-id} Short summary" \
  -f description="$(cat /tmp/mr_body.md)" \
  -F remove_source_branch=true \
  "/projects/issue%2F<project>-<issue-id>/merge_requests" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('web_url') or d)"
```

**MR conventions:**
- Title format: `{type}: #{issue-id} Short summary` — Conventional Commits
- Always `remove_source_branch: true`
- Target branch: confirm with the user if not `main`
- Always append the AI disclosure line
- Always include `Closes #{issue-id}` in the description

---

## Draft vs Ready

Toggle the MR state to signal work progress:

| State | Meaning | GitLab label |
|-------|---------|--------------|
| Draft | Work in progress / changes requested | `state::needsWork` |
| Ready | Awaiting review | `state::needsReview` |

Use the GitLab web UI to toggle, or pass `-f draft=true/false` in the API call.

---

## After the MR is open

- Re-run CI by pushing a new commit — `glab ci run` is blocked
- Merging is only possible via the GitLab **web UI** — `glab mr merge` is blocked on git.drupalcode.org
- Fast-forward merges are required; merging one MR makes sibling MRs stale (they will need rebasing)
- GitLab squash-merges use the MR title as the final commit message — make sure the title follows Conventional Commits format

---

## Gotchas

- **`glab mr create` cannot create cross-project MRs** — always use `glab api`
- **Check for an existing MR before creating** — avoid duplicates
- **`glab mr merge` is blocked** — direct users to the GitLab web UI merge button
- **The fork must be provisioned before pushing** — pushing to a non-existent fork URL returns 404; see [contribution.md](contribution.md)
- **Remind the user to fill in the contribution attribution link** from the auto-posted comment: `https://new.drupal.org/contribution-record?source_link=...`
- **SSH remotes use `git.drupal.org`**, not `git.drupalcode.org` — see the parent SKILL.md hostname table
