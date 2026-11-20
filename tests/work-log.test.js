'use strict';

// The opt-in work log is called from three places. They must agree on the
// config file and the flags, or one call site silently logs nothing.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { applyLocal } = require('../bin/local-setup');

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

test('only the local.json path writes the work-log file', () => {
  for (const f of ['bin/setup.js', 'bin/install.js']) {
    assert.doesNotMatch(read(f), /work-log/, f);
  }
  assert.match(read('.gitignore'), /^local\.json$/m);
});

test('local.json sets up a workspace once and records it', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'work-log-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const cwd = path.join(dir, 'ws');
  const file = path.join(dir, 'local.json');
  fs.mkdirSync(path.join(cwd, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(cwd, '.claude/settings.local.json'), JSON.stringify({ permissions: { allow: ['Read(x)'] } }));
  fs.writeFileSync(file, JSON.stringify({ workLogCommand: '/opt/log.sh' }));

  assert.deepEqual(applyLocal({ cwd, file, targets: ['claude-code'], dryRun: true }).length, 3);
  assert.equal(fs.existsSync(path.join(cwd, '.drupal-contrib/work-log.md')), false);

  applyLocal({ cwd, file, targets: ['claude-code'], dryRun: false });
  assert.match(fs.readFileSync(path.join(cwd, '.drupal-contrib/work-log.md'), 'utf8'), /^\/opt\/log\.sh$/m);
  const settings = JSON.parse(fs.readFileSync(path.join(cwd, '.claude/settings.local.json'), 'utf8'));
  assert.deepEqual(settings.permissions.allow, ['Read(x)', 'Bash(/opt/log.sh:*)']);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).workspaces, [cwd]);

  // A hand-edited work-log.md is never overwritten; a re-run changes nothing.
  fs.writeFileSync(path.join(cwd, '.drupal-contrib/work-log.md'), '/other\n');
  assert.deepEqual(applyLocal({ cwd, file, targets: ['claude-code'], dryRun: false }), []);
  assert.equal(fs.readFileSync(path.join(cwd, '.drupal-contrib/work-log.md'), 'utf8'), '/other\n');
});

test('no local.json means nothing happens', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'work-log-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  assert.deepEqual(applyLocal({ cwd: dir, file: path.join(dir, 'local.json'), targets: ['claude-code'], dryRun: false }), []);
  assert.deepEqual(fs.readdirSync(dir), []);
});
