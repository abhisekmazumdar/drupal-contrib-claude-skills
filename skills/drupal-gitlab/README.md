drupal-gitlab
=============

Skill for managing GitLab operations on `git.drupalcode.org` using the GitLab CLI (`glab`).
Covers branch and merge request workflows, issue/work item management, CI/CD monitoring, and
Drupal's issue-fork model.

Requirements
------------

*   A drupal.org account — access to `git.drupalcode.org` is linked to your drupal.org identity.
*   A personal access token with `api` and `write_repository` scopes, created at
    `https://git.drupalcode.org/-/user_settings/personal_access_tokens`.
*   `glab` (GitLab CLI) installed — see below.

Installing glab
---------------

*   macOS: `brew install glab`
*   Linux (Debian/Ubuntu): download a binary from the releases page or add the official apt
    repository — see https://docs.gitlab.com/cli/ for repository setup commands.
*   Linux (Fedora/RHEL): `dnf install glab`
*   Windows: `scoop install glab`

Full installation documentation: https://docs.gitlab.com/cli/

Configuring glab for git.drupalcode.org
----------------------------------------

Run the interactive login command and choose token-based authentication when prompted:

```bash
glab auth login --hostname git.drupalcode.org
```

Verify the configuration:

```bash
GITLAB_HOST=git.drupalcode.org glab auth status --hostname git.drupalcode.org
```

Work Items and Legacy Issues
-----------------------------

Drupal.org is migrating all projects from its proprietary issue queue to GitLab work items
(`/-/work_items/<id>`), which is the current issue-tracking system for new and migrated projects.
Some projects still use the legacy Drupal.org issue queue and may not have corresponding GitLab
work items. The skill supports both cases and does not require a work item to exist.

Issue Fork Workflow
--------------------

Drupal's issue fork system requires a manual provisioning step before you can push code.
After a work item is created, GitLab posts a comment with a link to the Drupal.org issue
management page:

    https://new.drupal.org/drupalorg/issue-fork/management?source_link=https://git.drupalcode.org/project/<project>/-/work_items/<issue-id>

On that page, click **"Create issue fork"** to provision the fork repository at:

    https://git.drupalcode.org/issue/<project>-<issue-id>

You cannot create the fork by pushing or via the GitLab API — Drupal's CDN blocks those
routes (returns 301 to `drupal.org/git-error`). Always provision through the management
page first.

The same comment also contains a contribution attribution link. Fill it in so project
maintainers can grant you credit for the contribution.

Further Reading
----------------

*   GitLab quick actions (shorthand syntax for issues, MRs, and comments):
    https://docs.gitlab.com/user/project/quick_actions/
*   GitLab CLI (glab) full command reference: https://docs.gitlab.com/cli/
