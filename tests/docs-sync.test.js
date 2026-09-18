'use strict';

// Catches drift between the installed package (skills/, agents/,
// bin/setup.js's externalSkills) and docs/index.html's hand-written
// reference tables. CLAUDE.md notes docs/index.html "won't drift into
// correctness on its own" — this is the automated check for that.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const docs = fs.readFileSync(path.join(root, 'docs/index.html'), 'utf8');
const setupSource = fs.readFileSync(path.join(root, 'bin/setup.js'), 'utf8');

function docsSection(id) {
  const match = docs.match(new RegExp(`<section id="${id}">([\\s\\S]*?)<\\/section>`));
  assert.ok(match, `docs/index.html has no <section id="${id}">`);
  return match[1];
}

function tableNames(sectionText) {
  return [...sectionText.matchAll(/<tr>\s*<td><code>([a-z][a-z0-9-]*)<\/code><\/td>/g)].map(m => m[1]);
}

function localSkillNames() {
  return fs.readdirSync(path.join(root, 'skills')).filter(name =>
    fs.statSync(path.join(root, 'skills', name)).isDirectory());
}

function agentNames() {
  return fs.readdirSync(path.join(root, 'agents'))
    .filter(f => f.endsWith('.md'))
    .map(f => path.basename(f, '.md'));
}

function externalSkillNames() {
  const block = setupSource.match(/const externalSkills = \[([\s\S]*?)\n {2}\];/);
  assert.ok(block, "bin/setup.js: couldn't locate the externalSkills array");
  return [...block[1].matchAll(/name:\s*'([^']+)'/g)].map(m => m[1]);
}

test('every local skill is documented in docs/index.html\'s Skills section', () => {
  const documented = new Set(tableNames(docsSection('skills')));
  for (const name of localSkillNames()) {
    assert.ok(documented.has(name), `skills/${name} is missing from docs/index.html's Skills section`);
  }
});

test('docs/index.html\'s Skills section has no stale entries', () => {
  const skills = new Set(localSkillNames());
  for (const name of tableNames(docsSection('skills'))) {
    assert.ok(skills.has(name), `docs/index.html documents skill '${name}', but skills/${name}/ doesn't exist`);
  }
});

test('every agent is documented in docs/index.html\'s Agents section', () => {
  const documented = new Set(tableNames(docsSection('agents')));
  for (const name of agentNames()) {
    assert.ok(documented.has(name), `agents/${name}.md is missing from docs/index.html's Agents section`);
  }
});

test('docs/index.html\'s Agents section has no stale entries', () => {
  const agents = new Set(agentNames());
  for (const name of tableNames(docsSection('agents'))) {
    assert.ok(agents.has(name), `docs/index.html documents agent '${name}', but agents/${name}.md doesn't exist`);
  }
});

test('every external skill is documented in docs/index.html\'s External skills section', () => {
  const documented = new Set(tableNames(docsSection('external-skills')));
  for (const name of externalSkillNames()) {
    assert.ok(documented.has(name), `externalSkills entry '${name}' (bin/setup.js) is missing from docs/index.html's External skills section`);
  }
});

test('docs/index.html\'s External skills section has no stale entries', () => {
  const external = new Set(externalSkillNames());
  for (const name of tableNames(docsSection('external-skills'))) {
    assert.ok(external.has(name), `docs/index.html documents external skill '${name}', but it's not in bin/setup.js's externalSkills array`);
  }
});
