#!/bin/bash
# Blocks git commands that discard local work with no recovery path.
# Adapted from mattpocock/skills' git-guardrails-claude-code, trimmed for this
# repo's workflow: `git push` (including --force-with-lease) is deliberately
# NOT blocked here — drupal-issue-reroll force-pushes rerolled branches to the
# user's own issue fork as a normal, expected step, already safe-guarded by
# --force-with-lease and gated behind the "ask" permission in settings.json.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command')

DANGEROUS_PATTERNS=(
  "git reset --hard"
  "git clean -fd"
  "git clean -f"
  "git branch -D"
  "git checkout \."
  "git restore \."
)

for pattern in "${DANGEROUS_PATTERNS[@]}"; do
  if echo "$COMMAND" | grep -qE "$pattern"; then
    echo "BLOCKED: '$COMMAND' matches dangerous pattern '$pattern'. This discards local work with no recovery path. The user has prevented you from doing this." >&2
    exit 2
  fi
done

exit 0
