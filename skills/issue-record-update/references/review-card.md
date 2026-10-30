# Review card

The one block a human reads first: what was checked, what's wrong, and who
does what next. Every review ends with it, in both the contributor flow and a
merge-maintainer workspace, so the same issue reads the same way in either.

Where it appears:

- **Chat:** the first thing in every review report — `drupal-issue-start`
  Phase 4, `drupal-issue-agent`'s findings, `drupal-issue-catchup`'s briefing.
  The detail sections follow it; they're the evidence, the card is the answer.
- **Issue record:** the whole of `## At a Glance` in `issues/<nid>/README.md`,
  overwritten in place each session (`drupal-issue-start` Phase 3,
  `issue-record-update`, `drupal-issue-catchup` Step 4). Never appended to.

## Format

Always inside a ```` ```text ```` fence, so the columns line up in the terminal
and in the raw README alike:

```text
<nid> · <issue title, cut to ~60 chars>
Verdict: <verdict> · <status> · <MR !<iid> → <target branch> | No MR>

<mark> Pipeline        <fact>
<mark> Scope           <fact>
<mark> Fix             <fact>
<mark> Tests           <fact>
<mark> Manually tested <fact>
<mark> Threads         <fact>
<mark> Branch          <fact>
<mark> Standards       <fact>
── maintainer ──
<mark> RTBC trust      <fact>
<mark> Release freeze  <fact>
<mark> Security freeze <fact>
<mark> Cherry-picks    <branch> <mark>  <branch> <mark>  …
<mark> Credit          <fact>

▶ Next: <owner> — <one action>
⏸ Waiting on: <the one thing stopping Next, or "nothing">
```

The `── maintainer ──` rows appear only in a merge-maintainer workspace (one
whose review answers "merge or not, and onto which branches"). The
contributor flow stops after `Standards`.

## Marks

| Mark | Meaning |
|---|---|
| ✅ | Checked, and fine |
| ❌ | Blocks the verdict |
| ⚠️ | Needs attention, doesn't block |
| ⏳ | In progress: CI running, a pick MR open, a reply awaited |
| ➖ | Doesn't apply (no MR yet, no JS changed, no backport needed) |
| ❔ | Not checked this session |

❔ is never shown as ✅. If a check didn't run, the card says so. That's the
whole point of having one.

## Rows

Every row is always present, in this order, so a missing check shows up as
❔ instead of a missing line. Facts are one short phrase (~60 chars). Detail
goes in the report under the card.

| Row | What it answers | Fact examples |
|---|---|---|
| Pipeline | Latest pipeline on the MR head | `green (#1022877)` · `red: cspell, phpstan` · `running (#951751)` |
| Scope | Diff matches the issue, nothing unrelated bundled | `matches the issue` · `bundles unrelated alt-text change` |
| Fix | Correct, and addresses the root cause | `root cause, lazy-loads on first open` · `symptom only: …` · `preliminary read only` |
| Tests | Automated coverage for the change | `Kernel test for the empty-token case` · `none for the new branch` |
| Manually tested | Someone ran it, not just read it (e2e runs count) | `3 people in a browser` · `e2e: 7 scenarios pass` · `nobody yet` |
| Threads | Open reviewer threads | `all resolved` · `1 open: line 459 (blocking)` |
| Branch | Up to date with the target | `up to date with 1.x` · `12 behind 1.x, conflicts` |
| Standards | phpcs, phpstan, cspell, eslint, stylelint | `all clean` · `cspell: "hardcodeable"` · `CI only, not run locally` |
| RTBC trust | Who set RTBC, and whether anyone tested | `set by a.dmitriiev` · `non-maintainer, tested by 3` · `non-maintainer, untested` |
| Release freeze | Merge window for stable target branches | `1.x not stable: clear` · `1.5.x freeze Tue–Wed 10-13/14` |
| Security freeze | Pending security release? | `confirm with the team` (❔ unless the human confirmed it this session) |
| Cherry-picks | Each other branch that needs the fix | `1.6.x ✅  1.5.x ⏳  2.x ⏳` · `none needed` · `uncertain: ask maintainers` |
| Credit | Whether landing it took real work | `clean merge, nothing extra` · `resolved pick conflict: credit yourself` |

A preliminary review (`drupal-issue-start` Phase 2.5) reads the diff but doesn't
run the full checklist. Mark what it actually established and leave the rest
❔. Don't upgrade a quick read to ✅ on `Fix`.

## Verdict, Next, Waiting on

- **Verdict:** contributor flow uses `RTBC-ready` · `Close — <gap>` ·
  `Needs work — <gap>` · `Needs discussion — <topic>` · `No MR yet`.
  Merge-maintainer uses `MERGE` · `DO NOT MERGE — <reason>` · `MERGED` (once it
  has landed; then the card tracks the picks).
- The verdict must agree with the marks: any ❌ rules out `RTBC-ready` and
  `MERGE`.
- **Next:** one action, with its owner first: `You` · `Contributor
  (<username>)` · `Maintainer (<username>)` · `CI` · `Nobody — done`. From this
  session's findings only, never carried over from an older session.
- **Waiting on:** what stops `Next` from happening right now, or `nothing`.

## When it changes (catchup)

When `drupal-issue-catchup` rebuilds the card, it marks every row whose mark
changed since the card in the record with `← was <old mark>`:

```text
✅ Pipeline        green (#970073)          ← was ⏳
```

Rows that didn't change carry no marker, so what moved shows up at a glance.
The record keeps the clean card (no `← was` markers); the markers are for
the chat briefing only.

## Example (merge-maintainer)

```text
3586671 · Load the DeepChat bundle on demand
Verdict: MERGE · RTBC · MR !2095 → 1.x

✅ Pipeline        green (#1022877)
✅ Scope           matches the issue, nothing bundled
✅ Fix             root cause; lazy-loads on first open
✅ Tests           DeepChatLazyLoadTest added
✅ Manually tested 3 people ran it in a browser
⚠️ Threads         1 open: cadence96 wording nit (non-blocking)
✅ Branch          up to date with 1.x
✅ Standards       phpcs, phpstan, cspell clean
── maintainer ──
✅ RTBC trust      non-maintainer, but tested by 3
✅ Release freeze  1.x not stable: clear
❔ Security freeze confirm with the team
⏳ Cherry-picks    1.6.x ✅  1.5.x ⏳  2.x ⏳  2.0.x ⏳
➖ Credit          clean merge, nothing extra

▶ Next: You — merge !2095, then open the 3 remaining picks
⏸ Waiting on: nothing
```
