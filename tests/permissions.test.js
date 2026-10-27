'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const raw = fs.readFileSync(path.join(root, 'templates/settings.json.template'), 'utf8');
const { permissions } = JSON.parse(raw.replace(/\{\{[A-Z_]+\}\}/g, 'placeholder'));

// Approximates Claude Code's Bash rule matching: `*` stands for any text, and
// a trailing ` *` also matches the bare command.
const matches = (rule, command) => {
  const body = rule.match(/^Bash\((.*)\)$/)?.[1];
  if (!body) return false;
  const pattern = body.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  return new RegExp(`^${pattern}$`).test(command) || (body.endsWith(' *') && body.slice(0, -2) === command);
};
const asks = (command) => permissions.ask.some((rule) => matches(rule, command));

test('no allow rule starts with a wildcard', () => {
  // Claude Code warns at startup about these, and they auto-approve any command containing the text.
  for (const rule of permissions.allow) assert.doesNotMatch(rule, /^\w+\(\*/, rule);
});

test('GitLab writes are asked, never denied', () => {
  for (const rule of permissions.deny) assert.doesNotMatch(rule, /glab/, rule);
});

const outward = [
  'GITLAB_HOST=git.drupalcode.org glab mr note 12 -m "hi" --repo project/ai',
  'glab --repo project/ai mr comment 12 -m hi',
  'glab mr create --repo issue/ai-1',
  'glab mr merge 12', 'glab mr approve 12', 'glab mr update 12 --draft', 'glab mr close 12',
  'GITLAB_HOST=git.drupalcode.org glab issue note 3 -m hi', 'glab issue comment 3 -m hi',
  'glab issue create -t x', 'glab issue update 3', 'glab issue close 3',
  'glab ci run', 'glab pipeline run',
  'glab api --hostname git.drupalcode.org -f title=x /projects/1/merge_requests',
  'drupalorg issue:assign 3540491', 'drupalorg issue:label 3540491 x', 'drupalorg issue:fork 3540491',
  'drupalorg issue:get-access 3540491', 'drupalorg self:update',
  'git commit -m fix', 'git -C module commit -m fix',
  'git push fork HEAD', 'git -C module push --force-with-lease fork HEAD',
  'git stash drop', 'git -C module stash clear', 'git checkout -- src/File.php', 'git checkout main -- src',
];
for (const command of outward) test(`asks before ${command}`, () => assert.ok(asks(command)));

const reads = [
  'GITLAB_HOST=git.drupalcode.org glab mr list --repo project/ai --search 3540491',
  'GITLAB_HOST=git.drupalcode.org glab issue view 3 --repo project/ai',
  'GITLAB_HOST=git.drupalcode.org glab ci status -b main -R project/ai',
  'drupalorg issue:show 3540491', 'drupalorg mr:list 3540491',
  'git status', 'git checkout feature', 'git stash list',
];
for (const command of reads) test(`does not ask before ${command}`, () => {
  assert.ok(!asks(command));
  assert.ok(permissions.allow.some((rule) => matches(rule, command)));
});
