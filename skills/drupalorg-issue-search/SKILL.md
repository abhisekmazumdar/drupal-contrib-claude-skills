---
name: drupalorg-issue-search
description: >
  Search for Drupal.org issues by keyword across the API, the classic issue
  queue, and the web. Use when the user wants to find existing issues before
  filing a new one, look up an issue by topic instead of number, or check
  whether a bug/feature has already been reported for a project. Trigger on:
  "search drupal.org issues for X", "find issues about X", "has anyone
  reported X", "is there an existing issue for X". Requires the
  `drupalorg-cli` skill/binary to be installed.
argument-hint: <query> [--project=<project>] [--status=all] [--skip=web_search,api_search,drupalorg_scrape]
---

# /drupalorg-issue-search

**Purpose:** Find existing Drupal.org issues by keyword, combining CLI API
search, Drupal.org issue-queue scraping, and web search into one deduplicated
summary — for both classic (non-migrated) and GitLab work-item (migrated)
projects.

**Usage:** `/drupalorg-issue-search <query> [--project=<project>] [--status=all] [--skip=web_search,api_search,drupalorg_scrape]`

---

## Instructions

1. **Parse inputs**: extract the search `query` and optional flags:
   - `--project`: project machine name
   - `--status`: issue status filter (default: `all`)
   - `--skip`: comma-separated list of channels to skip. Valid values:
     `api_search`, `drupalorg_scrape`, `web_search`. For example
     `--skip=web_search` skips the web search; `--skip=api_search,web_search`
     runs only the Drupal.org scrape.

2. **Detect project and issue queue type**: if `--project` is not provided,
   try to infer the project machine name from the current git remote:
   ```bash
   git config --get remote.origin.url
   ```
   Extract the project name from the URL (pattern: `*/project-name.git`). If
   detection fails, proceed without a project filter.

   Once the project name is known, check whether it uses GitLab work items:
   ```bash
   drupalorg project:issues <project> --limit=1 --format=json
   ```
   If the output contains a `"gitlab_issues"` key, or the command prints
   `"Project uses GitLab work items"` to stderr, the project has migrated. In
   that case:
   - Skip the `api_search` and `drupalorg_scrape` channels (they search the
     classic D.o issue queue, which is empty for migrated projects).
   - For `web_search`, target `site:git.drupalcode.org/project/<project>/-/issues`
     instead.
   - Note to the user: "This project uses GitLab work items. Search results
     are from GitLab."

3. **Run enabled searches in parallel** (skip any channel listed in `--skip`):

   a. **API search** (channel: `api_search`):
   ```bash
   drupalorg issue:search <query> --status=<status> --format=json
   ```
   If a project is known, include it as the first argument:
   ```bash
   drupalorg issue:search <project> <query> --status=<status> --format=json
   ```

   b. **Drupal.org issue queue scrape** (channel: `drupalorg_scrape`) — if a
      project is known, fetch the project's issue search page with
      `WebFetch`:
   ```
   URL: https://www.drupal.org/project/issues/<project>?text=<query words joined by +>&status=All
   Prompt: Extract all issue NIDs (numeric IDs from URLs like /node/XXXX or
   /issues/XXXX), titles, and statuses from this page. Return as a compact
   list.
   ```
   Replace spaces in the query with `+` for the URL parameter. This channel
   searches issue titles and bodies server-side, so it can find older and
   closed issues the API search misses. If no project is known, skip this
   channel.

   c. **Web search** (channel: `web_search`):
   - If project is known: `<query> site:https://www.drupal.org/project/issues/<project>`
   - If project is unknown: `<query> site:https://www.drupal.org/project/issues/`

4. **Extract NIDs** from all active sources:
   - API search: from the JSON response
   - Drupal.org scrape: from the extracted issue list
   - Web search: from URLs matching `/issues/{nid}` or `/node/{nid}` where
     `{nid}` is numeric

5. **Deduplicate**: collect all unique NIDs across sources.

6. **Enrich web-only results**: for any NID found via web search but not
   already present in the API or scrape results (which already carry
   titles), fetch details:
   ```bash
   drupalorg issue:show <nid> --format=llm
   ```

7. **Present results**: output a combined summary table with columns NID,
   Title, Status, Link (`https://www.drupal.org/node/{nid}`). Group results
   by source if helpful (API results first, then scrape results, then
   web-only results).
