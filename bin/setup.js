#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const PACKAGE_ROOT = path.join(__dirname, '..');
const CWD = process.cwd();
const FORCE = process.argv.includes('--force');

// ── helpers ──────────────────────────────────────────────────────────────────

function isDrupalRoot(dir) {
  if (fs.existsSync(path.join(dir, 'web'))) return true;
  const composerPath = path.join(dir, 'composer.json');
  if (fs.existsSync(composerPath)) {
    try {
      const composer = JSON.parse(fs.readFileSync(composerPath, 'utf8'));
      const reqs = { ...(composer.require || {}), ...(composer['require-dev'] || {}) };
      if (Object.keys(reqs).some(k => k.startsWith('drupal/'))) return true;
    } catch (_) {}
  }
  return false;
}

function copyDirMerge(src, dest, force, log) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirMerge(srcPath, destPath, force, log);
    } else {
      if (fs.existsSync(destPath) && !force) {
        log.skipped.push(path.relative(CWD, destPath));
      } else {
        fs.copyFileSync(srcPath, destPath);
        log.copied.push(path.relative(CWD, destPath));
      }
    }
  }
}

function renderTemplate(templatePath, vars) {
  let content = fs.readFileSync(templatePath, 'utf8');
  for (const [key, value] of Object.entries(vars)) {
    content = content.split(`{{${key}}}`).join(value);
  }
  return content;
}

function ask(rl, question) {
  return new Promise(resolve => rl.question(question, answer => resolve(answer.trim())));
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🎸 drupal-claude-skills setup\n');

  // Drupal root detection
  if (!isDrupalRoot(CWD)) {
    console.warn('⚠️  Warning: this directory does not look like a Drupal project root.');
    console.warn('   (No web/ directory and no composer.json with drupal/* dependencies found.)');
    console.warn('   You can still continue — files will be written to the current directory.\n');
  }

  // Interactive prompts
  const dirName = path.basename(CWD);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const projectName = await ask(rl, `DDEV project name [${dirName}]: `) || dirName;
  const defaultUrl = `https://${projectName}.ddev.site`;
  const siteUrl = await ask(rl, `Site URL [${defaultUrl}]: `) || defaultUrl;
  const phpVersion = await ask(rl, 'PHP version [8.4]: ') || '8.4';
  const mariadbVersion = await ask(rl, 'MariaDB version [11.8]: ') || '11.8';

  rl.close();
  console.log('');

  const vars = {
    DDEV_PROJECT: projectName,
    SITE_URL: siteUrl,
    PHP_VERSION: phpVersion,
    MARIADB_VERSION: mariadbVersion,
  };

  // .claude/ directory
  const claudeDir = path.join(CWD, '.claude');
  if (!fs.existsSync(claudeDir)) fs.mkdirSync(claudeDir, { recursive: true });

  const log = { copied: [], skipped: [] };

  // Copy skills
  const skillsSrc = path.join(PACKAGE_ROOT, 'skills');
  const skillsDest = path.join(claudeDir, 'skills');
  copyDirMerge(skillsSrc, skillsDest, FORCE, log);

  // Copy agents
  const agentsSrc = path.join(PACKAGE_ROOT, 'agents');
  const agentsDest = path.join(claudeDir, 'agents');
  copyDirMerge(agentsSrc, agentsDest, FORCE, log);

  // Generate .claude/settings.json
  const settingsTemplate = path.join(PACKAGE_ROOT, 'templates', 'settings.json.template');
  const settingsDest = path.join(claudeDir, 'settings.json');
  if (fs.existsSync(settingsDest) && !FORCE) {
    log.skipped.push('.claude/settings.json');
  } else {
    const settingsContent = renderTemplate(settingsTemplate, vars);
    fs.writeFileSync(settingsDest, settingsContent);
    log.copied.push('.claude/settings.json');
  }

  // Generate CLAUDE.md (ask if already exists)
  const claudeMdDest = path.join(CWD, 'CLAUDE.md');
  const claudeMdTemplate = path.join(PACKAGE_ROOT, 'templates', 'CLAUDE.md.template');

  let writeClaude = true;
  if (fs.existsSync(claudeMdDest) && !FORCE) {
    const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await ask(rl2, 'CLAUDE.md already exists. Overwrite? [y/N]: ');
    rl2.close();
    writeClaude = answer.toLowerCase() === 'y';
  }

  if (writeClaude) {
    const claudeMdContent = renderTemplate(claudeMdTemplate, vars);
    fs.writeFileSync(claudeMdDest, claudeMdContent);
    log.copied.push('CLAUDE.md');
  } else {
    log.skipped.push('CLAUDE.md');
  }

  // Summary
  console.log('\n── Summary ──────────────────────────────────────────────────');
  if (log.copied.length) {
    console.log('\nCreated / updated:');
    for (const f of log.copied) console.log(`  ✓  ${f}`);
  }
  if (log.skipped.length) {
    console.log('\nSkipped (already exist — use --force to overwrite):');
    for (const f of log.skipped) console.log(`  –  ${f}`);
  }
  console.log('\nDone. Open this project in Claude Code and paste a Drupal.org issue URL — or run /drupal-issue-start <url> to get started.\n');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
