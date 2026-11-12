# Merge Requests

MRs on Drupal GitLab flow **from the issue fork to the upstream project** (cross-project). `glab mr create` does not support cross-project MRs — use `create_mr.py` (next to this skill's `SKILL.md`).

---

## Before creating — check for an existing MR

GitLab may auto-create an MR when you push a branch. Always check first:

```bash
glab mr list -R project/<repo>
glab mr view <mr-iid> -R project/<repo>
```

---

## Creating a cross-project MR

### Step 1 — Read the MR template

```bash
cat .gitlab/merge_request_templates/Default.md
```

Fill in the template and save to `/tmp/mr_body.md`. If the template has an AI disclosure section, fill it with the statement below as plain text; otherwise end the body with it, after a blank line (no tool or model names; `<uses>` is any of `research`, `writing`, `code`, in that order — full rules in `drupalorg-comment-format`):

```
<details><summary>AI disclosure</summary>

_Used AI to help with <uses> (<what it did>). The reasoning and positions are my own, and I reviewed everything before posting. ([Drupal.org AI policy](https://www.drupal.org/docs/develop/issues/issue-procedures-and-etiquette/policy-on-the-use-of-ai-when-contributing-to-drupal#s-disclosure))_

</details>
```

Also include `Closes #{issue-id}` somewhere in the description body to auto-close the work item on merge.

### Step 2 — Create the MR

```bash
python3 <skills-root>/drupal-gitlab/create_mr.py --fork issue/<project>-<issue-id> \
  --target project/<repo> --source-branch {branch-name} --target-branch main \
  --title "feat: #{issue-id} Short summary" --description-file /tmp/mr_body.md
```

The script looks up both project IDs, prints the existing MR if the push
already opened one, and otherwise POSTs `/projects/<fork-id>/merge_requests`
with `remove_source_branch=true`. It refuses a fork outside `issue/` and a body
without the AI disclosure. Prefer it to raw `glab api`: it can only open an MR,
so it runs without a permission prompt, while `glab api` (which can also post
comments) still asks. Keep the path unquoted so the allow rule matches.

**MR conventions:**
- Title format: `{type}: #{issue-id} Short summary` — Conventional Commits
- Always `remove_source_branch: true`
- Target branch: confirm with the user if not `main`
- Always append the collapsible AI disclosure
- Always include `Closes #{issue-id}` in the description
- **Default to an issue fork even with maintainer push access** — it keeps the workflow consistent for other contributors; only push straight to origin when the user explicitly confirms a direct maintainer push

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

- **`glab mr create` cannot create cross-project MRs** — always use `create_mr.py`
- **Check for an existing MR before creating** — avoid duplicates
- **`glab mr merge` is blocked** — direct users to the GitLab web UI merge button
- **The fork must be provisioned before pushing** — pushing to a non-existent fork URL returns 404; see [contribution.md](contribution.md)
- **Remind the user to fill in the contribution attribution link** from the auto-posted comment: `https://new.drupal.org/contribution-record?source_link=...`
- **SSH remotes use `git.drupal.org`**, not `git.drupalcode.org` — see the parent SKILL.md hostname table
