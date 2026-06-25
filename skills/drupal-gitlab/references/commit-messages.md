# Commit Messages

Drupal uses the **Conventional Commits** specification. Every commit must follow this format exactly.

---

## Format

```
{type}: #{issue-id} Short summary of the change

Optional body — explain the why, not the what.
Wrap at ~72 characters.

By: drupal-username
By: other-contributor
```

---

## Types

| Type | When to use |
|------|-------------|
| `feat` | New feature or capability |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `refactor` | Code restructure without behaviour change |
| `test` | Adding or updating tests |
| `ci` | CI/CD configuration changes |
| `perf` | Performance improvement |
| `task` | Maintenance, chores, dependency updates |
| `revert` | Reverts a previous commit |

---

## Rules

- **Issue ID**: the last segment of the issue URL (e.g. `3586461` from `/-/work_items/3586461`). The numeric ID is identical whether sourced from drupal.org or GitLab — no conversion needed.
- **`By:` lines**: use **Drupal.org usernames**, not GitLab usernames, email addresses, or `@username` syntax. Ask the contributor if unsure.
- **All contributors** get a `By:` line — author, reviewer, reporter. Maintainers may additionally use `Co-authored-by:`, `Reviewed-by:`, or `Reported-by:` for specificity.
- **Summary line**: imperative mood, no trailing period, ≤72 characters including the type prefix.
- **GitLab squash-merges** use the MR title as the final commit message — ensure the MR title also follows this format.

---

## Example

```
feat: #3586461 Add standardized commit message format

Drupal projects previously had no enforced commit format, making
changelogs hard to generate and contributor attribution inconsistent.
This establishes Conventional Commits as the standard.

By: alice-drupal
By: bob-drupal
```
