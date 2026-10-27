'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const url = 'https://www.drupal.org/docs/develop/issues/issue-procedures-and-etiquette/policy-on-the-use-of-ai-when-contributing-to-drupal#s-disclosure';
const line = `_[AI disclosure](${url}): Used AI to help with <uses> (<what it did>). The reasoning and positions are my own, and I reviewed everything before posting._`;

// One format everywhere a post is drafted; drupalorg-comment-format holds the full rules.
for (const file of [
  'skills/drupalorg-comment-format/SKILL.md',
  'skills/drupal-gitlab/SKILL.md',
  'skills/drupal-gitlab/references/merge-requests.md',
  'templates/CLAUDE.md.template',
  'templates/AGENTS.md.template',
]) test(`${file} uses the standard AI disclosure line`, () => assert.ok(read(file).includes(line)));

test('Claude Code adds no attribution of its own', () => {
  // Older Claude Code versions reject `attribution: false`, so hide each part explicitly.
  const settings = JSON.parse(read('templates/settings.json.template').replace(/\{\{[A-Z_]+\}\}/g, 'placeholder'));
  assert.deepEqual(settings.attribution, { commit: '', pr: '', sessionUrl: false });
});

test('no legacy or tool-naming disclosure formats remain', () => {
  const files = ['skills', 'agents'].flatMap((dir) => fs.readdirSync(path.join(root, dir), { recursive: true })
    .filter((f) => f.endsWith('.md')).map((f) => path.join(dir, f)));
  for (const file of files) {
    const text = read(file);
    assert.doesNotMatch(text, /Used \[tool\]|_AI assisted/, file);
    for (const disclosure of text.match(/Used AI to help with [^\n]*/g) ?? []) {
      assert.doesNotMatch(disclosure, /Claude|Codex|GPT|Gemini|Copilot/, file);
    }
  }
});
