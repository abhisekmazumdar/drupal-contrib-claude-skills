'use strict';

// End-to-end check of skills/drupal-impact/drupal_impact.py against a tiny
// fake module: commit a base, make the kinds of edit AI diffs get wrong
// (interface signature, route rename, schema change with no update hook),
// and assert every finding points at a real file:line.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const script = path.join(root, 'skills/drupal-impact/drupal_impact.py');
const fixture = path.join(__dirname, 'fixtures/drupal-impact');

const has = (cmd) => spawnSync(cmd, ['--version'], { encoding: 'utf8' }).status === 0;
const skip = !has('python3') ? 'python3 not available' : !has('git') ? 'git not available' : false;

function sandbox(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drupal-impact-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.cpSync(fixture, dir, { recursive: true });
  const module = path.join(dir, 'impact_fixture');
  const git = (...args) => {
    const r = spawnSync('git', args, { cwd: module, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout;
  };
  git('init', '-q', '-b', '1.x');
  git('-c', 'user.name=t', '-c', 'user.email=t@example.com', 'add', '-A');
  git('-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', 'base');
  return { dir, module, consumer: path.join(dir, 'impact_consumer') };
}

function edit(file, from, to) {
  const text = fs.readFileSync(file, 'utf8');
  assert.ok(text.includes(from), `${file} lacks ${from}`);
  fs.writeFileSync(file, text.replace(from, to));
}

function lineOf(file, needle) {
  const index = fs.readFileSync(file, 'utf8').split('\n').findIndex(l => l.includes(needle));
  assert.ok(index >= 0, `${needle} not in ${file}`);
  return index + 1;
}

function scan(cwd, ...args) {
  const r = spawnSync('python3', [script, '.', '--base', 'HEAD', '--format', 'json', ...args], { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

test('flags the breaking changes with file:line evidence', { skip }, t => {
  const { module, consumer } = sandbox(t);
  edit(path.join(module, 'src/GreeterInterface.php'),
    'public function greet(string $name): string;',
    "public function greet(string $name, string $punctuation = '!'): string;");
  edit(path.join(module, 'impact_fixture.routing.yml'), 'impact_fixture.greeting:', 'impact_fixture.greeting_page:');
  edit(path.join(module, 'config/schema/impact_fixture.schema.yml'),
    "      label: 'Greeting'\n",
    "      label: 'Greeting'\n    punctuation:\n      type: string\n      label: 'Punctuation'\n");

  const report = scan(module, '--scan', consumer);
  assert.equal(report.schema, 1);
  assert.equal(report.risk, 'HIGH');
  const piece = (kind, id) => {
    const found = report.pieces.find(p => p.kind === kind && p.id === id);
    assert.ok(found, `no ${kind} piece ${id} in ${report.pieces.map(p => `${p.kind}:${p.id}`).join(', ')}`);
    return found;
  };

  // Interface signature change → HIGH, with the consumer module's implementer.
  const greet = piece('php-api', 'Drupal\\impact_fixture\\GreeterInterface::greet');
  assert.equal(greet.change, 'signature changed');
  assert.equal(greet.risk, 'HIGH');
  const loud = path.join(consumer, 'src/LoudGreeter.php');
  assert.ok(greet.consumers.some(c => c.outside && path.resolve(module, c.file) === loud
    && c.line === lineOf(loud, 'class LoudGreeter implements GreeterInterface')),
  JSON.stringify(greet.consumers, null, 2));

  // Route rename → its callers, in and outside the module.
  const route = piece('route', 'impact_fixture.greeting');
  assert.equal(route.change, 'renamed');
  const block = path.join(module, 'src/Plugin/Block/GreetingBlock.php');
  assert.ok(route.consumers.some(c => path.resolve(module, c.file) === block
    && c.line === lineOf(block, "Url::fromRoute('impact_fixture.greeting')")));
  assert.ok(route.consumers.some(c => c.outside && /fromRoute/.test(c.text)));

  // Schema change without hook_update_N / hook_post_update_NAME.
  const schema = piece('config-schema', 'impact_fixture.settings');
  assert.equal(schema.risk, 'HIGH');
  assert.ok(schema.reasons.some(r => /no update hook/.test(r)), schema.reasons.join('; '));

  // Covering tests, labelled by suite.
  const suites = new Set(greet.tests.map(x => x.suite));
  assert.ok(suites.has('Unit') && suites.has('Kernel'), JSON.stringify(greet.tests));
  assert.ok(report.tests_to_run.some(x => x.file.endsWith('GreeterTest.php')));

  assert.ok(report.not_detected.length >= 4);
  assert.equal(report.scan_skipped, false);
});

test('a schema change with an update hook is not flagged as missing one', { skip }, t => {
  const { module } = sandbox(t);
  edit(path.join(module, 'config/schema/impact_fixture.schema.yml'), "label: 'Greeting'\n", "label: 'Greeting text'\n");
  fs.writeFileSync(path.join(module, 'impact_fixture.post_update.php'),
    '<?php\n\nfunction impact_fixture_post_update_greeting_label() {\n}\n');
  const schema = scan(module).pieces.find(p => p.kind === 'config-schema');
  assert.ok(schema);
  assert.ok(!schema.reasons.some(r => /no update hook/.test(r)), schema.reasons.join('; '));
});

test('no-op diff → empty report, exit 0, blind spots still listed', { skip }, t => {
  const { module } = sandbox(t);
  const report = scan(module);
  assert.deepEqual(report.pieces, []);
  assert.equal(report.risk, 'NONE');
  assert.equal(report.scan_skipped, true);
  assert.ok(report.not_detected.length >= 4);

  const md = spawnSync('python3', [script, '.', '--base', 'HEAD'], { cwd: module, encoding: 'utf8' });
  assert.equal(md.status, 0, md.stderr);
  assert.match(md.stdout, /## Not detected by this scanner/);
  assert.match(md.stdout, /Dependents in other modules were NOT checked/);
});

test('--symbols maps consumers without a diff', { skip }, t => {
  const { module, consumer } = sandbox(t);
  const report = scan(module, '--symbols', 'GreeterInterface::greet,impact_fixture.greeter', '--scan', consumer);
  assert.equal(report.mode, 'symbols');
  const greet = report.pieces.find(p => p.id === 'Drupal\\impact_fixture\\GreeterInterface::greet');
  assert.ok(greet && greet.consumers.some(c => c.outside));
  assert.ok(report.pieces.some(p => p.kind === 'service' && p.id === 'impact_fixture.greeter'));
});
