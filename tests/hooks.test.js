'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const hook = path.resolve(__dirname, '../templates/hooks/block-dangerous-git.sh');

const denied = [
  'git reset --hard', 'git -C "module dir" reset --hard HEAD',
  'git --git-dir=.git -c color.ui=never reset --hard',
  'git clean -df', 'git clean --force -d', 'git clean -ffdx',
  'git branch -D work', 'git branch --force --delete work',
  'git checkout -- .', 'git restore --worktree .', 'git restore :/',
  'git status && git -C module reset --hard',
  'bash -lc "git -C module clean -fd"',
  'env GITLAB_HOST=git.drupalcode.org glab --repo project/ai mr comment 1',
  'glab mr --repo project/ai create', 'glab api projects',
  'glab issue update 1', 'glab pipeline run', 'git push --force fork HEAD',
];
const allowed = [
  'git status', 'git -C module diff', 'git reset --soft HEAD~1',
  'git clean -nfd', 'git branch -d merged', 'git checkout feature',
  'git restore src/File.php', 'git push --force-with-lease fork HEAD',
  'git add src && git commit -m fix',
  'GITLAB_HOST=git.drupalcode.org glab mr list --repo project/ai',
  'glab --repo project/ai issue view 1', 'glab ci status',
  'python3 script.py', 'echo "git reset --hard"',
];
for (const [commands, status] of [[denied, 2], [allowed, 0]]) {
  for (const command of commands) test(`hook ${status ? 'blocks' : 'allows'} ${command}`, () => {
    const result = spawnSync('bash', [hook], { input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }), encoding: 'utf8' });
    assert.equal(result.status, status, result.stderr);
  });
}
test('malformed input blocks without exposing command credentials', () => {
  for (const input of ['not-json', '{}', '{"tool_input": {"command": 123}}']) {
    assert.equal(spawnSync('bash', [hook], { input, encoding: 'utf8' }).status, 2);
  }
  const result = spawnSync('bash', [hook], { input: JSON.stringify({ tool_input: { command: 'glab api --token TOP_SECRET projects' } }), encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.doesNotMatch(result.stderr, /TOP_SECRET/);
});
