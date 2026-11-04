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
`blast-radius` skill (user-run) reasons about breakage grep can't show; this
report is its starting map, so its effort goes on the hard part.

Resolve the script relative to this installed `SKILL.md`; `<skills-root>`
is the parent of this skill directory, supplied by the active client's
workspace instructions. Run `--help` for every flag.

```bash
python3 "<skills-root>/drupal-impact/drupal_impact.py" <module_dir> \
  --base origin/<target-branch> --scan <webroot>/modules/contrib --format all --out <dir>
# planning, no diff: FQCN or short name (Class::method), service ID, route,
# permission, plugin ID, config name or hook name
python3 "<skills-root>/drupal-impact/drupal_impact.py" <module_dir> --symbols A,B --scan <webroot>/modules/contrib
```

## Steps for the agent

1. Resolve `<module_dir>` and the base ref. In an MR context the base is the
   MR's target branch (`origin/<target-branch>`); otherwise omit `--base` and
   the script picks the merge-base with the default branch.
2. Inside a Drupal site, pass `--scan <webroot>/modules/contrib` so other
   modules' dependents are found (the module itself is skipped there). If you
   skip the scan, say so — the report does too.
3. Read `impact.md`: it caps consumers at 15 per piece. Look a piece up in
   `impact.json` only when you need its full consumer list — on a large MR the
   JSON is far bigger than the Markdown. Write a summary of at most 5
   sentences, in plain language, above the report.
4. **The summary may only mention pieces and consumers that are in the
   report.** Never add a consumer you believe exists but the scan didn't list
   — put it to the human as a question instead.
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

When the report has a HIGH or MEDIUM piece, remind the human they can run
`/blast-radius` (Codex: `$blast-radius`) on the saved report: it reasons about
the breakage this scan can't see, starting from this map. It's reserved for
explicit user invocation — never run it, read its file, or imitate it. Pass
`tests_to_run` to whoever runs the tests, so the tests that name the touched
pieces run first.
