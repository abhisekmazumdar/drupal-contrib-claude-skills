# CI failure patterns

Reference for `drupal-issue-agent` A1. Read this only when a pipeline is
failing — it's a lookup table, not part of the always-active review
procedure. Match the failing job's trace against these before attempting
any fix; most CI failures fall into one of these buckets.

| Pattern in log | Diagnosis | Direct fix |
|---|---|---|
| `error: ... Line exceeds 80 characters` | PHPCS line length | Wrap the line; use `drupal-coding-standards` skill to auto-fix |
| `error: Missing function doc comment` | PHPCS missing docblock | Add `/** */` above the method |
| `Unsafe usage of new static` | PHPStan — Drupal pattern | Add to `phpstan.neon` `ignoreErrors` |
| `Call to an undefined method` | PHPStan — wrong class/missing `use` | Check `use` statement; verify method exists on the interface |
| `Parameter #N ... expects X, Y given` | PHPStan type mismatch | Fix the type declaration or cast at the call site |
| `Class "Drupal\Tests\...\..." not found` | PHPUnit wrong namespace | Capital `T` in `Tests`; check `@group` and file path match |
| `Table "..." doesn't exist` | Kernel test missing schema | Install the module in `setUp` via `installEntitySchema` or `installSchema` |
| `Headers already sent` | Functional test output leak | Remove any `echo`/`print`/`dpm()` left in code |
| `Your requirements could not be resolved` | Composer version conflict | Check `composer.json` constraints against Drupal version |
| `Branch is behind` / merge conflict in log | Branch needs reroll | Use the `drupal-issue-reroll` skill |
| `CSpell: Issues found: N in N file` | British/non-standard spelling in code or comments | Use American English spelling (e.g. `serialization` not `serialisation`). CSpell only runs in CI, not locally — check any new words in docblocks, comments, and test method names |

If none of these match, read the full trace and identify the job name (PHPCS,
PHPStan, phpunit) to narrow scope before investigating further. If the cause
still isn't obvious after that, use the `diagnosing-bugs` skill's phased
reproduce/hypothesize/isolate loop rather than guessing at fixes — this is
for failures that don't fit a known pattern, not a replacement for the table
above.
