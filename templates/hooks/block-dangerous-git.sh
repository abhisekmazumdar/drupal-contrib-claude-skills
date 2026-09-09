#!/bin/bash
# Blocks destructive Git commands and the toolkit's reserved GitLab writes.
# Adapted from mattpocock/skills' git-guardrails-claude-code, trimmed for this
# repo's workflow: `git push` (including --force-with-lease) is deliberately
# NOT blocked here — drupal-issue-reroll force-pushes rerolled branches to the
# user's own issue fork as a normal, expected step, already safe-guarded by
# --force-with-lease and gated behind the "ask" permission in settings.json.

# Both clients send tool_input.command as JSON on stdin. Keep parsing and
# policy in one helper; this wrapper also works when installed under .codex.
hook_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if ! command -v python3 >/dev/null 2>&1; then
  echo 'BLOCKED: python3 is required to run the contribution command guard.' >&2
  exit 2
fi
exec python3 "$hook_dir/check-command.py"
