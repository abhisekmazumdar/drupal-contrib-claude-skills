'use strict';

// A security fix pushed to a public issue fork is disclosed before the
// advisory. These checks keep the security URL recognized and the no-push
// rule present everywhere a security issue flows through.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const start = 'skills/drupal-issue-start/SKILL.md';
const agent = 'agents/drupal-issue-agent.md';
const catchup = 'agents/drupal-issue-catchup.md';

test('security URLs are recognized where issue URLs are parsed', () => {
  for (const f of [start, catchup]) {
    assert.match(read(f), /git\.drupalcode\.org\/security\/<sec-nid>-<slug>\/-\/work_items\/<iid>/, f);
    assert.match(read(f), /security-<sec-nid>-<iid>/, f);
  }
});

test('security issues never push or open an MR', () => {
  assert.match(read(start), /\*\*Security issues \(`is_security=true`\) stay private\.\*\*.*never push at all/);
  assert.match(read(start), /skip the recon checkout entirely/);
  const section = read(agent).match(/## Security issues \(`is_security=true`\)\n([\s\S]*?)\n## /);
  assert.ok(section, 'drupal-issue-agent needs its Security issues section');
  assert.match(section[1], /\*\*Never push\*\*/);
  assert.match(section[1], /Don't run `create_mr\.py` or `glab mr create`/);
  assert.match(read(agent), /\*\*Security issues never push\.\*\*/);
});

test('create_mr.py still refuses anything outside issue/ forks', () => {
  assert.match(read('skills/drupal-gitlab/create_mr.py'), /if not args\.fork\.startswith\("issue\/"\)/);
});
