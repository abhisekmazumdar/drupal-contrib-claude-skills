# Drupal Contrib Workflow — Skills & Agents Plan (updated 2026-07-05)

Repo: `abhisekmazumdar/drupal-contrib-claude-skills`
Goal: structure issue review → implementation → testing with clear gates between each phase.

This is the revised version of the original plan, updated after auditing the repo
against it. Names have been reconciled with what actually exists, decisions that
were pending are now recorded, and each remaining item has a status.

---

## Decisions made

| Original plan question | Decision |
|---|---|
| Split into 3 agents (`issue-analyst` / `drupal-implementer` / `e2e-tester`) vs. one agent with phase gates? | **One agent with enforced phase gates** (`drupal-issue-agent` with `[PAUSE]` hard stops) — except testing, which IS split out into a dedicated `drupal-e2e-tester` agent so the implementer never verifies its own work. |
| Entry flow: is "URL → skill → skill calls agent" correct? | **Yes — kept.** The skill (`drupal-issue-start`) runs in the main conversation where the user can converse at the hard stop; the agent gets a clean context for the heavy lifting. What was missing was a defined **pause-relay protocol** (sub-agents can't talk to the user mid-run) — now specified in both the skill and the agent. |
| E2E testing approach | **Playwright** drives browser-based e2e against the DDEV site, using the manual testing steps (A8/B3) as the test script, plus the PHPUnit suite via DDEV. |
| Plan's proposed names | Superseded by existing repo names: `drupal-issue-context` → `drupal-issue-start` (skill), `issue-analyst` → `drupal-issue-start` Phase 0–4 + `drupal-issue-catchup`, `drupal-implementer` → `drupal-issue-agent` Paths A/B, `drupal-dev-standards` → `drupal-coding-standards` + `drupal-php-changes` + `ddev-expert` + `drupal-gitlab/references/`, `e2e-tester` → `drupal-e2e-tester`. |

---

## Workflow Overview (current)

```
User: paste Drupal.org / GitLab issue URL
   → /drupal-issue-start (skill, main conversation)
       loads prior record (issues/<nid>/README.md), fetches live state
       output: structured report + suggested next steps
   → [GATE: hard stop — user picks a direction]
   → drupal-issue-agent (sub-agent)
       Path A (existing MR: review + fix loop) / Path B (new issue: plan → implement)
       every [PAUSE] = agent ends run with "[PAUSE — awaiting user decision]" report
       → skill relays verbatim → user replies → agent resumed/re-invoked
   → [GATE: A9 review report / B3 implementation plan — item-specific approval]
   → Phase T: drupal-e2e-tester (sub-agent, report-only)
       PHPUnit via DDEV + Playwright browser e2e from the manual testing steps
       output: pass/fail per scenario + explicit coverage gaps + screenshots
   → [GATE: failures relayed as numbered items — each fix needs approval]
   → user reviews, approves push / Drupal.org comment
```

---

## Status of the original plan's five gaps

1. **Split responsibilities** — ✅ Resolved. Single `drupal-issue-agent` with
   non-negotiable `[PAUSE]` gates and item-specific approvals; testing isolated in
   `drupal-e2e-tester` (Phase T) so a failing test cannot be silently "fixed"
   without visibility.
2. **GitLab MR content access** — ⚠️ Tooling exists (`drupalorg mr:diff`,
   `fetch.py` for inline threads, `fetch_issue_notes.py` for work items, `glab mr
   note list` for top-level comments). **Still to do:** one end-to-end verification
   run against a real MR with `glab` auth.
3. **Decision-point enforcement** — ❌ Open. Add a mandatory `**Recommendation:**`
   line to `drupal-issue-start` Phase 4 — one of *implement fresh / continue
   existing MR / needs discussion — do not implement* — driven by issue status
   (RTBC/Fixed → do not touch) and MR state, mirrored in the agent's Phase 1
   triage card. Today path selection is by MR count only and nothing guards RTBC.
4. **Dedicated test agent** — ✅ Done. `agents/drupal-e2e-tester.md`: report-only
   (no code edits ever), writes only under `issues/<nid>/e2e/` and
   `issues/<nid>/screenshots/`, reports pass/fail **plus what was not covered**.
5. **CI validation of skill frontmatter** — ❌ Open. `ci.yml` only regex-checks
   that a `name:` line exists. Strengthen to: require `---` YAML delimiters,
   `name` + `description` fields, `name` matching the skill directory, and lint
   `agents/*.md` frontmatter the same way.

---

## Phase T — dedicated test phase (implemented)

- `drupal-e2e-tester` is invoked by `drupal-issue-agent` at the end of A10 (fixes
  done) or B5 (implementation done, before push), or directly by the user
  ("test it" / "verify in the browser") via the `drupal-issue-start` Phase 5 table.
- **Layer 1 — PHPUnit** via `ddev exec phpunit` (Unit / Kernel / Functional),
  following the `drupal-automated-testing` skill.
- **Layer 2 — Playwright** browser e2e: the A8/B3 manual testing steps are the
  script; every `✓ Expect:` / `✗ Expect:` becomes an assertion; login via fresh
  `ddev drush uli` links passed by env var (never hardcoded credentials);
  `ignoreHTTPSErrors` for the DDEV self-signed cert; screenshots on every key
  assertion saved to `issues/<nid>/screenshots/`.
- Report contract: per-suite and per-scenario results, full failure output, a
  mandatory **Not covered** section, site cleanup notes, and a verdict. Fixes are
  never applied by the tester — failures route back to `drupal-issue-agent` as
  numbered items needing explicit approval.
- Requirement (optional install): `npm i -D @playwright/test && npx playwright
  install chromium`. `settings.json.template` allows `npx playwright test` and
  asks before `npx playwright install`.

---

## Remaining actions

- [ ] Add the mandatory `**Recommendation:**` field + RTBC "do not touch" guard to
      `drupal-issue-start` Phase 4 and the `drupal-issue-agent` Phase 1 triage card
      (gap 3)
- [ ] Strengthen the CI frontmatter lint: YAML delimiters, `name` + `description`
      required, `name` == directory name, cover `agents/*.md` too (gap 5)
- [ ] Verify MR diff + inline/top-level comment fetching end-to-end via `glab`
      against a real MR (gap 2)
- [ ] Dry-run the pause-relay loop and Phase T on a real issue in an installed
      workspace to confirm the resume/re-invoke path works in practice
