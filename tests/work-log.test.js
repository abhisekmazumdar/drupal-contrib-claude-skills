'use strict';

// The opt-in work log is called from three places. They must agree on the
// config file and the flags, or one call site silently logs nothing.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const visits = ['skills/drupal-issue-start/SKILL.md', 'agents/drupal-issue-catchup.md'];
const record = 'skills/issue-record-update/SKILL.md';

test('every call site reads .drupal-contrib/work-log.md', () => {
  for (const f of [...visits, record]) {
    assert.match(read(f), /\.drupal-contrib\/work-log\.md/, f);
  }
});

test('visits log the URL only; the record update adds --did', () => {
  for (const f of visits) {
    assert.match(read(f), /<command> "<issue-url>" --json/, f);
  }
  assert.match(read(record), /<command> "<issue-url>" --did "<TL;DR>" --json/);
});

test('the installer never writes the work-log file', () => {
  for (const f of ['bin/setup.js', 'bin/install.js']) {
    assert.doesNotMatch(read(f), /work-log/, f);
  }
});
