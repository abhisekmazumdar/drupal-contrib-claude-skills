---
name: drupal-impact
description: >
  Map what a Drupal code change touches and what depends on it: services, hooks,
  plugins, routes, permissions, config schema, events, public PHP APIs, and the
  tests that cover them. Deterministic scan with file:line evidence, plus a Mermaid
  diagram. Use before reviewing an MR or AI-written diff, when asked "what does this
  change affect / impact / blast radius in Drupal", before planning a change to a
  shared API, or to pick which tests to run first.
argument-hint: "[module-path] [--base <ref>]"
---

# drupal-impact

One script: `drupal_impact.py`. Python 3.9+ standard library, read-only, no
network, no DDEV — it runs on the host with `git` and file reads.

Drupal wires code through YAML, attributes/annotations and string IDs, so
import and call graphs miss most of what a change can break. This scanner
reads the diff, names the Drupal pieces it touches, and greps the module plus
any `--scan` roots for their consumers and covering tests. It reports facts
only — every consumer is a line it found in a file. The external
`blast-radius` skill reasons about breakage grep can't show; give it this
report as its starting map, so its effort goes on the hard part.

Resolve the script relative to this installed `SKILL.md`. In workflow
examples, `<skills-root>` is the parent of this skill directory; it is
supplied by the active client's workspace instructions.

## Standalone use

1. Plain script, from anywhere, with or without an agent:
   ```bash
   python3 "<skills-root>/drupal-impact/drupal_impact.py" <module_dir> --base origin/1.x
   ```
2. `/drupal-impact` in Claude Code, `$drupal-impact` in Codex.
3. Only this skill, without the rest of the toolkit:
   ```bash
   npx skills add abhisekmazumdar/drupal-contrib-claude-skills --skill drupal-impact
   ```
   Offline, or without `npx`: copy `skills/drupal-impact/` from this repo into
   your client's skills directory (`.claude/skills/drupal-impact/` or
   `.agents/skills/drupal-impact/`). The script has no other dependency.

```bash
python3 drupal_impact.py [MODULE_DIR]
    [--base REF]              # default: merge-base of HEAD with origin's default branch
    [--head REF]              # default: working tree, untracked files included
    [--symbols A,B,...]       # no diff: impact of named symbols (planning)
    [--scan PATH ...]         # extra roots to search for dependents
    [--format md|json|mermaid|all]   # default md; all needs --out
    [--out DIR]               # write impact.md / impact.json / impact.mmd
    [--max-nodes N]           # Mermaid cap, default 40
    [--fail-on high|medium]   # non-zero exit at that risk; default always 0
```

`--symbols` takes FQCNs or short names (`GreeterInterface::greet`), service
IDs, route names, permissions, plugin IDs, config names, or hook names. Names
it can't find in the module are listed in the report's notes.

## Steps for the agent

1. Resolve `<module_dir>` and the base ref. In an MR context the base is the
   MR's target branch (`origin/<target-branch>`); otherwise let the script
   pick the merge-base with the default branch.
2. Inside a Drupal site, pass `--scan <webroot>/modules/contrib` so other
   modules' dependents are found. The module itself is skipped automatically
   when it sits under that root. If you skip the scan, say so — the report
   does too.
3. Run with `--format all --out <dir>` and read `impact.json`. Write a summary
   of at most 5 sentences, in plain language, above the report.
4. **The summary may only mention pieces and consumers that are in the JSON.**
   Never add a consumer you believe exists but the scan didn't list — put it
   to `blast-radius` or the human as a question instead.
5. Inside the issue flow, save the report as a **new** file
   `issues/<nid>/impact-<short-sha>.md` (summary + `impact.md`), where
   `<short-sha>` is the head commit. If that file already exists, the same
   commit was scanned before: reuse it, never overwrite it.

## Reading the report

- **HIGH** — a removed, renamed or re-signed public method, interface, class,
  service, plugin ID, route or event with consumers **outside** the module; a
  config schema change with no `hook_update_N`/`hook_post_update_NAME` in the
  diff; a removed or renamed permission. Each one needs an answer in the
  review: fix it, add a BC layer or update path, or name the follow-up.
- **MEDIUM** — the same kinds of change with consumers only inside the
  module, or any touched piece no test references.
- **LOW** — everything else (additions, body changes with tests).

Every row's *Why* column says which rule fired. `## Changes with no detected
Drupal piece` lists changed lines no detector claimed — read those yourself.

The `## Not detected by this scanner` list is part of the result, not
boilerplate: dynamic IDs, JS consumers, alter hooks, decorators and custom
site code are invisible here. A clean report means "nothing grep can see",
not "safe". Detection rules and limits: `references/detection-rules.md`.

## Hand-off

Pass `impact.json` to `blast-radius` as its starting map; its job is the
breakage this scan can't see. Pass `tests_to_run` to whoever runs the tests,
so the tests that name the touched pieces run first.
