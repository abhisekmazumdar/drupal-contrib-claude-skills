# CI/CD

```bash
glab ci status          # pipeline status for current branch
glab ci view            # interactive pipeline view
glab ci trace <job>     # stream full log of a specific job
```

Use `glab ci trace <job-name>` as the **primary tool for debugging pipeline failures** — it streams the full job log. Fetching the GitLab job page directly won't work (requires JavaScript rendering).

---

## Re-running CI

**`glab ci run` is blocked on git.drupalcode.org** — pipeline triggers via the API are disabled infrastructure-wide. Re-run CI by pushing a new commit:

```bash
# Push a real change
git push <project>-<issue-id> {branch-name}

# Or push an empty commit to trigger CI without changing code
git commit --allow-empty -m "ci: re-run pipeline"
git push <project>-<issue-id> {branch-name}
```

---

## Fetching job logs via the API

If `glab ci trace` is unavailable, fetch the log through the API:

```bash
# Get job ID from pipeline
JOB_ID=$(glab api --hostname git.drupalcode.org \
  "/projects/project%2F<repo>/pipelines/<pipeline-id>/jobs" \
  | python3 -c 'import sys,json; jobs=json.load(sys.stdin); [print(j["id"], j["name"]) for j in jobs]')

# Fetch the trace
glab api --hostname git.drupalcode.org \
  "/projects/project%2F<repo>/jobs/<job-id>/trace"
```

---

## Gotchas

- **`glab ci run` does not work** — pipeline triggers are blocked; use an empty commit push instead
- **Never WebFetch the GitLab job page** — it requires JavaScript and will return incomplete content; use `glab ci trace` or the API endpoint instead
