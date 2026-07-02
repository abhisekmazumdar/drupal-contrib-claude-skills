# mem0 Cross-Issue Context — Implementation Plan

## What we are building

A global semantic memory layer that accumulates knowledge across all Drupal contribution sessions. When you start working on an issue, Claude automatically surfaces related past fixes, patterns, and gotchas from any project you have worked in. Completely optional — everything degrades gracefully if mem0 is not set up.

---

## Global directory structure

```
~/.drupal-claude-skills/
  memory/                  ← Chroma vector DB (persistent, grows over time)
  mem0.config.json         ← written by setup.js on first mem0-enabled run
  scripts/
    mem0_add.py            ← add a memory after issue work
    mem0_search.py         ← search memories when starting an issue
```

These scripts ship inside this repo under `scripts/mem0/` and get copied to `~/.drupal-claude-skills/scripts/` by `bin/setup.js` when the user opts in. They are never copied into the target project workspace — they live globally.

---

## mem0 config (no LLM required)

mem0 can run embedder + vector store only. We craft memory text explicitly in the skills so mem0's LLM-based extraction is not needed. This removes one dependency — no local LLM model required beyond the embedding model.

```json
{
  "embedder": {
    "provider": "ollama",
    "config": {
      "model": "nomic-embed-text",
      "ollama_base_url": "http://localhost:11434"
    }
  },
  "vector_store": {
    "provider": "chroma",
    "config": {
      "collection_name": "drupal_issues",
      "path": "~/.drupal-claude-skills/memory"
    }
  }
}
```

---

## Python scripts

**`scripts/mem0/mem0_add.py`**
```
usage: python3 mem0_add.py "<memory text>" --metadata '{"nid":"123","module":"ai","type":"bug"}'
```
Reads `~/.drupal-claude-skills/mem0.config.json`, initialises mem0, stores the memory with metadata.

**`scripts/mem0/mem0_search.py`**
```
usage: python3 mem0_search.py "<query>" --limit 3
output: JSON array of {memory, metadata, score}
```
Reads config, queries by semantic similarity, returns top N results as JSON for Claude to parse.

---

## `bin/setup.js` changes

Add an opt-in question after all existing questions, before `rl.close()`:

```
Enable cross-issue memory with mem0? [y/N]:
```

If **N** — skip entirely, no warnings, setup continues as now.

If **Y** — run prerequisite checks in order:

| Check | Command | If missing |
|---|---|---|
| Ollama running | `ollama list` | Print install instructions, abort mem0 setup |
| nomic-embed-text pulled | `ollama list \| grep nomic-embed-text` | Print `ollama pull nomic-embed-text`, abort |
| mem0 installed | `pip show mem0` | Print `pip install mem0 chromadb`, abort |
| chromadb installed | `pip show chromadb` | Same as above |

If all pass:
1. Create `~/.drupal-claude-skills/scripts/` and copy `scripts/mem0/*.py` from the package
2. Write `~/.drupal-claude-skills/mem0.config.json`
3. Set `HAS_MEM0=true` in vars — controls whether bash permissions go into `settings.json`

Lock file saves the mem0 choice so re-runs are non-interactive.

---

## `templates/settings.json.template` changes

Two new bash permissions added when `HAS_MEM0` is true. Since the template is static JSON, the simplest approach is to always include these permissions — they are harmless if the scripts do not exist (the bash call just fails and Claude skips):

```json
"Bash(python3 ~/.drupal-claude-skills/scripts/mem0_add.py *)",
"Bash(python3 ~/.drupal-claude-skills/scripts/mem0_search.py *)"
```

---

## `issue-record-update` skill changes

Add a final step after writing `issues/<nid>/README.md`:

```
## Step N — Save to memory (if mem0 available)

Check if `~/.drupal-claude-skills/scripts/mem0_add.py` exists. If not, skip.

Craft a single memory sentence covering:
- Module name
- What the problem was
- What the fix or approach was
- Key files or classes touched

Then run:

  python3 ~/.drupal-claude-skills/scripts/mem0_add.py \
    "<crafted memory>" \
    --metadata '{"nid":"<nid>","module":"<module>","type":"<bug|feature|task>"}'

Confirm the script exits 0 and log "Memory saved."
```

---

## `drupal-issue-start` skill changes

Add a step between fetching issue data and presenting the report:

```
## Step N — Check related past work (if mem0 available)

Check if `~/.drupal-claude-skills/scripts/mem0_search.py` exists. If not, skip.

Build a query from: module name + 2–3 keywords from the issue title.

  python3 ~/.drupal-claude-skills/scripts/mem0_search.py \
    "<module> <keywords>" --limit 3

If results return with score > 0.7, add a "Related past work" section to the
issue report before presenting it:

  ## Related past work
  - NID 3499692 (ai): Fixed null ref in provider fallback — check ProviderManager.php
  - NID 3501234 (ai): Streaming support added same session, same class affected
```

Score threshold (0.7) keeps noise out — only surfaces genuinely similar results.

---

## Graceful degradation — the rule everywhere

Every mem0 touch in skills and setup follows the same pattern:

```
Check if the script exists → if not, skip silently and continue
```

No errors, no warnings to the user mid-session. mem0 is invisible when absent, useful when present.

---

## What is NOT in this plan

- MCP server for mem0 — Python scripts via bash are simpler and sufficient. No daemon to keep running, no port conflicts.
- Multi-user / shared memory — global dir is per machine, per user. Team sharing is out of scope.
- Memory deletion / management UI — out of scope for now. Can add a `mem0_forget.py` script later if needed.

---

## Implementation order

1. `scripts/mem0/mem0_add.py` and `mem0_search.py`
2. `bin/setup.js` — opt-in question, prerequisite checks, script copy, config write
3. `templates/settings.json.template` — add bash permissions
4. `issue-record-update` — add memory save step
5. `drupal-issue-start` — add memory query step
6. README and CLAUDE.md — document the feature
