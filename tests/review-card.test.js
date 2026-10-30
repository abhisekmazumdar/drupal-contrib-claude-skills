'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const card = 'skills/issue-record-update/references/review-card.md';

// Every report that ends a review opens with the shared card, and every
// writer of `## At a Glance` writes it. A merge-maintainer workspace's local
// overrides point at the same file, so the format can't fork per workspace.
const users = [
  'skills/drupal-issue-start/SKILL.md',
  'skills/issue-record-update/SKILL.md',
  'agents/drupal-issue-agent.md',
  'agents/drupal-issue-catchup.md',
];

test('review card reference exists and defines every mark', () => {
  const text = read(card);
  for (const mark of ['✅', '❌', '⚠️', '⏳', '➖', '❔', '▶ Next:', '⏸ Waiting on:']) {
    assert.ok(text.includes(mark), mark);
  }
});

for (const rel of users) {
  test(`${rel} uses the shared review card`, () => {
    assert.match(read(rel), /review-card\.md/);
  });
  test(`${rel} has no leftover At a Glance field bullets`, () => {
    assert.doesNotMatch(read(rel), /^- \*\*(Next action|Blocked on|Current MR):\*\* </m);
  });
}
