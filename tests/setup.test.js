'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { writer, agentToml } = require('../bin/install');
const { installExternal } = require('../bin/external-skills');

const root = path.resolve(__dirname, '..');
function workspace(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "drupal toolkit 'test-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}
function put(cwd, name, text) {
  fs.mkdirSync(path.dirname(path.join(cwd, name)), { recursive: true });
  fs.writeFileSync(path.join(cwd, name), text);
}
function read(cwd, name) { return fs.readFileSync(path.join(cwd, name), 'utf8'); }
function setup(cwd, ...args) {
  const result = spawnSync(process.execPath, [path.join(root, 'bin/setup.js'), '--yes', '--skip-external', ...args], { cwd, encoding: 'utf8', timeout: 15000 });
  assert.equal(result.status, 0, result.stderr + result.stdout);
  return result.stdout;
}

for (const target of ['claude-code', 'codex', 'both']) {
  test(`fresh ${target} install and idempotent update`, t => {
    const cwd = workspace(t);
    fs.mkdirSync(path.join(cwd, 'web'));
    put(cwd, '.ddev/config.yaml', 'name: contribution\n');
    setup(cwd, '--target', target);
    const context = read(cwd, '.drupal-contrib/context.md');
    assert.match(context, /contribution\.ddev\.site/);
    assert.doesNotMatch(context, /\{\{[A-Z_]+\}\}/);
    assert.equal(fs.existsSync(path.join(cwd, 'CLAUDE.md')), target !== 'codex');
    assert.equal(fs.existsSync(path.join(cwd, 'AGENTS.md')), target !== 'claude-code');
    if (target !== 'codex') {
      const settings = JSON.parse(read(cwd, '.claude/settings.json'));
      assert.equal(settings.mcpServers, undefined);
      assert.deepEqual(Object.keys(JSON.parse(read(cwd, '.mcp.json')).mcpServers), ['drupalorg-cli']);
      const cmd = settings.hooks.PreToolUse[0].hooks[0].command;
      // Validate executable hook registration even in a path containing spaces/quotes.
      const hook = spawnSync('bash', ['-c', cmd], { input: JSON.stringify({ tool_input: { command: 'git -C module reset --hard' } }), encoding: 'utf8' });
      assert.equal(hook.status, 2, hook.stderr);
    }
    if (target !== 'claude-code') {
      const parse = spawnSync('python3', ['-c', 'import pathlib,tomllib; root=pathlib.Path(".codex"); files=list(root.rglob("*.toml")); assert len(files)==5; [tomllib.loads(p.read_text()) for p in files]'], { cwd, encoding: 'utf8' });
      assert.equal(parse.status, 0, parse.stderr);
      assert.match(read(cwd, '.agents/skills/drupal-clone-contrib/agents/openai.yaml'), /allow_implicit_invocation: false/);
      assert.match(read(cwd, '.codex/agents/drupal-e2e-tester.toml'), /Never create, edit, or delete module code/);
      const hooks = JSON.parse(read(cwd, '.codex/hooks.json'));
      assert.equal(hooks.hooks.PreToolUse[0].matcher, '^Bash$');
    }
    const before = read(cwd, '.drupal-contrib/install.json');
    setup(cwd);
    assert.equal(read(cwd, '.drupal-contrib/install.json'), before);
  });
}

test('dry run changes nothing and does not download external skills', t => {
  const cwd = workspace(t);
  const result = spawnSync(process.execPath, [path.join(root, 'bin/setup.js'), '--target', 'both', '--dry-run'], { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(fs.readdirSync(cwd), []);
  assert.match(result.stdout, /Preview only/);
});

test('migrates legacy single-site answers and can add Codex later', t => {
  const cwd = workspace(t);
  fs.mkdirSync(path.join(cwd, 'web'));
  put(cwd, '.claude/claude-skills.lock.json', JSON.stringify({ vars: { DDEV_PROJECT: 'saved', SITE_URL: 'https://saved.example', PHP_VERSION: '8.3', MARIADB_VERSION: '10.11', DRUPAL_WEBROOT: 'web' } }));
  setup(cwd);
  setup(cwd, '--target', 'codex');
  const state = JSON.parse(read(cwd, '.drupal-contrib/install.json'));
  assert.deepEqual(state.targets, ['claude-code', 'codex']);
  assert.equal(state.vars.sites[path.basename(cwd)].siteUrl, 'https://saved.example');
  assert.match(read(cwd, '.drupal-contrib/context.md'), /8\.3 \| 10\.11/);
  assert.ok(fs.existsSync(path.join(cwd, '.claude/claude-skills.lock.json')));
});

test('preserves multi-site defaults and existing configuration on migration', t => {
  const cwd = workspace(t);
  for (const name of ['drupal', 'cms']) fs.mkdirSync(path.join(cwd, name, 'web'), { recursive: true });
  put(cwd, '.claude/claude-skills.lock.json', JSON.stringify({ vars: { sites: { cms: { ddevProject: 'cms-demo', siteUrl: 'https://cms.example', phpVersion: '8.4', mariadbVersion: '11.8', drupalSubdir: 'cms' } }, defaultSite: 'cms' } }));
  put(cwd, '.claude/settings.json', '{"custom":true}\n');
  put(cwd, '.codex/config.toml', 'model = "user-choice"\n');
  setup(cwd, '--target', 'both');
  assert.match(read(cwd, '.drupal-contrib/context.md'), /\| cms \| ✓ \| cms-demo/);
  assert.equal(read(cwd, '.claude/settings.json'), '{"custom":true}\n');
  assert.equal(read(cwd, '.codex/config.toml'), 'model = "user-choice"\n');
  assert.ok(fs.existsSync(path.join(cwd, '.drupal-contrib/proposals/.codex/config.toml')));
});

test('preserves an AGENTS.md symlink and its target', t => {
  const cwd = workspace(t);
  put(cwd, 'CLAUDE.md', 'User instructions\n');
  fs.symlinkSync('CLAUDE.md', path.join(cwd, 'AGENTS.md'));
  const result = setup(cwd, '--target', 'both');
  assert.ok(fs.lstatSync(path.join(cwd, 'AGENTS.md')).isSymbolicLink());
  assert.equal(read(cwd, 'AGENTS.md'), 'User instructions\n');
  assert.match(result, /Manual integration required/);
});

test('updates owned files but preserves user edits, custom skills, and linked parents', t => {
  const cwd = workspace(t);
  const first = writer(cwd);
  first.write('owned.md', 'v1');
  const second = writer(cwd, first.files);
  second.write('owned.md', 'v2');
  assert.equal(read(cwd, 'owned.md'), 'v2');
  put(cwd, 'owned.md', 'user edits');
  const third = writer(cwd, second.files);
  third.write('owned.md', 'v3');
  assert.equal(read(cwd, 'owned.md'), 'user edits');
  assert.equal(read(cwd, '.drupal-contrib/proposals/owned.md'), 'v3');
  put(cwd, '.drupal-contrib/proposals/owned.md', 'edited proposal');
  third.write('owned.md', 'v4');
  assert.equal(read(cwd, '.drupal-contrib/proposals/owned.md'), 'edited proposal');
  assert.ok(fs.readdirSync(path.join(cwd, '.drupal-contrib/proposals')).some(name => name.startsWith('owned.md.proposed-')));
  const outside = workspace(t);
  fs.symlinkSync(outside, path.join(cwd, '.codex'));
  third.write('.codex/config.toml', 'no escape');
  assert.deepEqual(fs.readdirSync(outside), []);
  put(cwd, '.claude/skills/custom/SKILL.md', 'custom');
  setup(cwd);
  assert.equal(read(cwd, '.claude/skills/custom/SKILL.md'), 'custom');
});

test('Codex agent generation preserves complete procedures and escapes TOML', t => {
  const cwd = workspace(t);
  const body = fs.readFileSync(path.join(root, 'agents/drupal-issue-agent.md'), 'utf8');
  put(cwd, 'agent.toml', agentToml(body));
  const parsed = spawnSync('python3', ['-c', 'import tomllib,json; print(json.dumps(tomllib.load(open("agent.toml","rb"))))'], { cwd, encoding: 'utf8' });
  assert.equal(parsed.status, 0, parsed.stderr);
  const agent = JSON.parse(parsed.stdout);
  assert.equal(agent.name, 'drupal-issue-agent');
  assert.ok(agent.developer_instructions.endsWith(body.replace(/^---\n[\s\S]*?\n---\n/, '')));
  assert.equal(agent.model, undefined);
});

test('invalid CLI targets fail before writing', t => {
  const cwd = workspace(t);
  const result = spawnSync(process.execPath, [path.join(root, 'bin/setup.js'), '--target', 'unknown'], { cwd, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.deepEqual(fs.readdirSync(cwd), []);
});

test('external pulls are grouped, staged, tracked, and explicit-only metadata is retained', t => {
  const cwd = workspace(t);
  const output = writer(cwd);
  const calls = [];
  const entries = [{ name: 'first', repo: 'owner/repo' }, { name: 'second', repo: 'owner/repo' }];
  installExternal({ cwd, targets: ['claude-code', 'codex'], entries, output,
    run(command, args, config) {
      assert.equal(command, 'npx');
      assert.notEqual(config.cwd, cwd);
      calls.push(args);
      const target = args[args.indexOf('--agent') + 1];
      assert.deepEqual(args.filter((_, i) => args[i - 1] === '--skill'), ['first', 'second']);
      for (const { name } of entries) put(config.cwd, `${target === 'codex' ? '.agents' : '.claude'}/skills/${name}/SKILL.md`, `---\nname: ${name}\ndescription: Test\ndisable-model-invocation: true\n---\n`);
      put(config.cwd, 'skills-lock.json', JSON.stringify({ version: 1, skills: { first: { source: 'owner/repo', sourceType: 'github', computedHash: 'first' }, second: { source: 'owner/repo', sourceType: 'github', computedHash: 'second' } } }));
    },
  });
  assert.equal(calls.length, 2);
  assert.equal(Object.keys(JSON.parse(read(cwd, 'skills-lock.json')).skills).length, 2);
  assert.match(read(cwd, '.agents/skills/first/agents/openai.yaml'), /allow_implicit_invocation: false/);
  assert.ok(fs.existsSync(path.join(cwd, '.claude/skills/second/SKILL.md')));
  installExternal({ cwd, targets: ['codex'], entries, output, run() { assert.fail('Existing skills must not be downloaded again'); } });
});

test('offline external pulls are non-fatal and custom skill metadata survives', t => {
  const cwd = workspace(t);
  put(cwd, '.agents/skills/custom/SKILL.md', '---\nname: custom\ndisable-model-invocation: true\n---\n');
  const metadata = 'interface:\n  display_name: "Mine"\npolicy:\n  allow_implicit_invocation: false\n';
  put(cwd, '.agents/skills/custom/agents/openai.yaml', metadata);
  const output = writer(cwd);
  installExternal({ cwd, targets: ['codex'], entries: [{ name: 'missing', repo: 'owner/repo', usedBy: 'Required for testing.' }, { name: 'custom', repo: 'owner/repo' }], output, run() { throw new Error('offline'); } });
  assert.equal(read(cwd, '.agents/skills/custom/agents/openai.yaml'), metadata);
  assert.equal(fs.existsSync(path.join(cwd, '.agents/skills/missing')), false);
});
