# Issues & Work Items

Drupal.org is transitioning all projects from its proprietary issue queue to GitLab work items. **Work items is the current, preferred method.** Not all projects have migrated — if `glab issue list` returns nothing, inform the user and continue without a work item.

Issue URLs use `/-/work_items/<id>` (not `/-/issues/<id>`). The iid (last URL segment) is used in all API calls.

---

## Common operations

```bash
# List issues
GITLAB_HOST=git.drupalcode.org glab issue list -R project/<repo>

# View an issue
GITLAB_HOST=git.drupalcode.org glab issue view <id> -R project/<repo>

# Post a comment (-m is required; --body is not valid)
GITLAB_HOST=git.drupalcode.org glab issue comment <id> -m "Message" -R project/<repo>
# note is an alias for comment — both accept the same flags
GITLAB_HOST=git.drupalcode.org glab issue note <id> -m "Message" -R project/<repo>
```

**Do not add `create` as a subcommand to `glab issue note` or `glab issue comment`** — the correct form is `glab issue comment <id>`, not `glab issue comment create <id>`.

---

## Creating a work item

Check available labels before creating:
```bash
GITLAB_HOST=git.drupalcode.org glab label list -R project/<repo>
```

Look up issue templates:
```bash
ls .gitlab/issue_templates/
cat ".gitlab/issue_templates/<TemplateName>.md"
```

Create:
```bash
GITLAB_HOST=git.drupalcode.org glab issue create \
  --title "Short descriptive title" \
  --description "$(cat /tmp/issue_body.md)" \
  --label "<label1>,<label2>" \
  --assignee "{username}" \
  -R project/<repo>
```

---

## Issue state — scoped labels

Issue workflow state is tracked via **scoped labels**, not a built-in status widget. Apply them via a `/do:label` comment or the GitLab label UI.

| State | Label | When to apply |
|-------|-------|---------------|
| Changes requested | `state::needsWork` | Reviewer left feedback; MR in Draft state |
| Awaiting review | `state::needsReview` | Author addressed feedback; MR in Ready state |
| Reviewed and tested | `state::rtbc` | CI green, no open threads, ready to merge |

```bash
# Apply via comment command
GITLAB_HOST=git.drupalcode.org glab issue comment <id> \
  -m "/do:label ~state::rtbc" -R project/<repo>
```

**Work item status cannot be set via labels alone for the status widget** — the scoped label approach above is the standard contributor method. If the project uses the GitLab status widget instead of labels, it requires a GraphQL mutation and maintainer permissions; inform the user and let them set it manually in the UI.

---

## `/do:` commands

These comment commands are unique to git.drupalcode.org:

| Command | Effect |
|---------|--------|
| `/do:fork` | Provisions the issue fork and initial branch |
| `/do:access` | Grants your account push access to an existing fork |
| `/do:label ~<label>` | Applies a label to the work item |
| `/do:assign @username` | Assigns the issue |

Post these as comments on the work item — they are processed by the Drupal.org GitLab integration.

---

## Gotchas

- **Not all projects have GitLab work items** — some still use the legacy Drupal.org issue queue; check before assuming `glab issue list` is exhaustive
- **`-m` is required for comments**, not `--body`
- **`note` is an alias for `comment`** — both work; do not add `create` as a subcommand
- **Labels are project-configurable** — run `glab label list` to confirm the exact names before applying
