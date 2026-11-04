'use strict';

// Claude Code never preloads a disable-model-invocation skill into an agent,
// and refuses it through the Skill tool, so listing one in `skills:` is dead
// weight and the step that relies on it silently does nothing. External
// user-run skills get suggested to the human instead (a "You run" line);
// our own two flagged skills get read at their gated step.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

// Every cursor/plugins skill pulled by bin/setup.js ships the flag upstream.
const userRun = ['how', 'why', 'blast-radius', 'interrogate', 'tdd', 'unslop', 'technical-writing'];

const localSkills = fs.readdirSync(path.join(root, 'skills'))
  .filter(n => fs.statSync(path.join(root, 'skills', n)).isDirectory());
const flaggedLocal = localSkills.filter(n => /^disable-model-invocation:\s*true/m.test(read(`skills/${n}/SKILL.md`)));
const externals = [...read('bin/setup.js').matchAll(/name:\s*'([^']+)'/g)].map(m => m[1]);
const agents = fs.readdirSync(path.join(root, 'agents')).filter(f => f.endsWith('.md'));

function preloads(file) {
  const block = read(`agents/${file}`).match(/^skills:\n((?: {2}- .+\n)+)/m);
  return block ? [...block[1].matchAll(/- (\S+)/g)].map(m => m[1]) : [];
}

function sources() {
  const out = [];
  for (const f of agents) out.push(`agents/${f}`);
  for (const n of localSkills) out.push(`skills/${n}/SKILL.md`);
  return out;
}

test('the user-run list matches cursor/plugins externals', () => {
  assert.deepEqual(userRun.filter(n => !externals.includes(n)), []);
  assert.ok(flaggedLocal.includes('drupal-clone-contrib') && flaggedLocal.includes('drupal-issue-reroll'));
});

for (const file of agents) {
  test(`${file} preloads only skills that can load`, () => {
    for (const name of preloads(file)) {
      assert.ok(localSkills.includes(name) || externals.includes(name), `${name} isn't a local or external skill`);
      assert.ok(!flaggedLocal.includes(name), `${name} sets disable-model-invocation; read its SKILL.md at the gated step instead`);
      assert.ok(!userRun.includes(name), `${name} is user-run; suggest it with a "You run" line instead`);
    }
  });
}

test('the issue agent does not preload its own caller', () => {
  assert.ok(!preloads('drupal-issue-agent.md').includes('drupal-issue-start'));
});

for (const rel of sources()) {
  test(`${rel} never runs a user-run skill itself`, () => {
    const text = read(rel);
    for (const name of userRun) {
      const n = name.replace('-', '\\-');
      assert.doesNotMatch(text, new RegExp(`<skills-root>/${n}/`), `${rel} reads ${name}'s files`);
      assert.doesNotMatch(text, new RegExp(`\\b(use|invoke|run) the \`${n}\` skill`, 'i'), `${rel} runs ${name}`);
    }
  });
}

test('every user-run skill is suggested somewhere in the flow', () => {
  const all = sources().map(read).join('\n');
  for (const name of userRun) {
    assert.match(all, new RegExp(`\`/${name.replace('-', '\\-')}\\b`), `/${name} is never suggested`);
  }
});
