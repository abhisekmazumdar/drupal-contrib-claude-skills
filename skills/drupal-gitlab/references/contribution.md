# Contribution Workflow & Fork Provisioning

Complete path for submitting a change to a Drupal project via GitLab.

---

## Before starting — two questions

**1. Is the project migrated to GitLab?**

- **Migrated:** issues at `git.drupalcode.org/project/<repo>/-/work_items/<id>` — use `glab`
- **Legacy:** issues at `www.drupal.org/project/<repo>/issues` — use the Drupal.org web UI
- Check by running `glab issue list -R project/<repo>`

**2. Do you need an issue fork?**

- **Maintainers** (push access to origin): can push directly to origin, but should still default to an issue fork to keep the workflow consistent for other contributors — only push straight to origin when the user explicitly confirms that's what they want
- **Contributors** (no push access): provision an issue fork first

---

## The contributor path

### Step 1 — Find or create a work item

```bash
glab issue list -R project/<repo>
glab issue view <id> -R project/<repo>

# Create a new work item if none exists
glab issue create \
  --title "Short descriptive title" \
  --description "$(cat /tmp/issue_body.md)" \
  --label "state::needsWork" \
  -R project/<repo>
```

### Step 2 — Provision the issue fork

A fork is **never** created by pushing or via the API. Use one of:

```
Does an issue fork exist at git.drupalcode.org/issue/<project>-<id>?
├─ No  → provision it:    post /do:fork as a comment on the work item
└─ Yes → do you have push access?
         ├─ Yes → use it directly
         └─ No  → request access: post /do:access as a comment
```

Verify push access:
```bash
git fetch <project>-<issue-id>
# HTTP 403 = need /do:access
# HTTP 404 = need /do:fork
```

### Step 3 — Configure remotes

```bash
# SSH remote uses git.drupal.org (not git.drupalcode.org)
git remote add <project>-<issue-id> git@git.drupal.org:issue/<project>-<issue-id>.git

# Verify
git remote -v
```

### Step 4 — Create the branch

```bash
git checkout -b {issue-id}-{short-description}
```

### Step 5 — Commit using Conventional Commits

See [commit-messages.md](commit-messages.md) for format rules.

### Step 6 — Push to the fork

```bash
git push <project>-<issue-id> {branch-name}
```

On first push, GitLab prints an MR creation URL — use it or create the MR manually via the API (see [merge-requests.md](merge-requests.md)).

### Step 7 — Open the MR

`glab mr create` does not support cross-project MRs. Use `glab api` — see [merge-requests.md](merge-requests.md).

Include `Closes #{issue-id}` in the MR description to auto-close the work item on merge.

### Step 8 — Attribution

GitLab posts a comment on the work item with a contribution record link when the item is created:
```
https://new.drupal.org/contribution-record?source_link=https://git.drupalcode.org/project/<project>/-/work_items/<issue-id>
```

Remind the contributor to fill this in — it is how maintainers grant credit. It is a separate step from the MR.

---

## After submission

- Toggle the MR between **Draft** (Needs Work) and **Ready** (Needs Review) states as work progresses
- Re-run CI by pushing a new commit — `glab ci run` is blocked on git.drupalcode.org
- Merge is only possible via the GitLab web UI — `glab mr merge` is blocked
- Fast-forward merges are required; merging one MR makes sibling MRs stale and they will need rebasing
