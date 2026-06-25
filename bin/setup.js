#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const PACKAGE_ROOT = path.join(__dirname, '..');
const CWD = process.cwd();

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

function findDrupalSubdir(dir) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      if (isDrupalRoot(path.join(dir, entry.name))) return entry.name;
    }
  } catch (_) {}
  return null;
}

function readDdevProjectName(drupalDir) {
  try {
    const configPath = path.join(drupalDir, '.ddev', 'config.yaml');
    const content = fs.readFileSync(configPath, 'utf8');
    const match = content.match(/^name:\s*(.+)$/m);
    return match ? match[1].trim() : null;
  } catch (_) {
    return null;
  }
}

function renderTemplate(templatePath, vars) {
  let content = fs.readFileSync(templatePath, 'utf8');
  for (const [key, value] of Object.entries(vars)) {
    content = content.split(`{{${key}}}`).join(value);
  }
  return content;
}

/**
 * Copy a single file, always overwriting with the latest source content.
 * Logs as 'identical' when the content is unchanged (skips the write),
 * and as 'copied' when the file is new or updated.
 * Never deletes destination files that are not in the source.
 */
function copyFile(srcContent, destPath, log) {
  const rel = path.relative(CWD, destPath);
  fs.mkdirSync(path.dirname(destPath), { recursive: true });

  if (fs.existsSync(destPath) && fs.readFileSync(destPath, 'utf8') === srcContent) {
    log.identical.push(rel);
    return;
  }

  fs.writeFileSync(destPath, srcContent);
  log.copied.push(rel);
}

/**
 * Recursively copy src into dest, rendering template vars in each file.
 * Only copies files present in src — never removes files already in dest.
 */
function copyDirMerge(src, dest, vars, log, skipDirs = new Set()) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.isDirectory() && skipDirs.has(entry.name)) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirMerge(srcPath, destPath, vars, log, skipDirs);
    } else {
      const srcContent = vars ? renderTemplate(srcPath, vars) : fs.readFileSync(srcPath, 'utf8');
      copyFile(srcContent, destPath, log);
    }
  }
}

function ask(rl, question) {
  return new Promise(resolve => rl.question(question, answer => resolve(answer.trim())));
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🎸 drupal-claude-skills setup\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  // ── Step 1: Where is Drupal? ───────────────────────────────────────────────
  let drupalSubdir;
  if (isDrupalRoot(CWD)) {
    drupalSubdir = '.';
    console.log('Drupal project detected at current directory.\n');
  } else {
    const detected = findDrupalSubdir(CWD);
    const defaultSubdir = detected || '.';
    const hint = detected ? `${detected} (auto-detected)` : '.';
    const answer = await ask(rl, `Where is your Drupal project? [${hint}]: `);
    drupalSubdir = answer || defaultSubdir;
    console.log('');
  }

  // DRUPAL_PATH: prefix for host-side paths ('' or 'drupal/')
  // DRUPAL_WEBROOT: full path to docroot from workspace root ('web' or 'drupal/web')
  const drupalPath = (drupalSubdir === '.' || drupalSubdir === '')
    ? ''
    : drupalSubdir.replace(/\/$/, '') + '/';
  const drupalWebroot = drupalPath + 'web';
  const drupalAbsDir = drupalSubdir === '.' ? CWD : path.join(CWD, drupalSubdir);

  // ── Step 2: DDEV + site details ────────────────────────────────────────────
  const detectedProject = readDdevProjectName(drupalAbsDir) || path.basename(drupalAbsDir);
  const projectName = await ask(rl, `DDEV project name [${detectedProject}]: `) || detectedProject;
  const defaultUrl = `https://${projectName}.ddev.site`;
  const siteUrl = await ask(rl, `Site URL [${defaultUrl}]: `) || defaultUrl;
  const phpVersion = await ask(rl, 'PHP version [8.4]: ') || '8.4';
  const mariadbVersion = await ask(rl, 'MariaDB version [11.8]: ') || '11.8';

  // ── Step 3: Optional skills ────────────────────────────────────────────────
  console.log('');
  console.log('Playwright skills add browser automation support (playwright-cli + issue-record-screenshot).');
  console.log('Requires: npm install -g @playwright/cli@latest');
  const playwrightAnswer = await ask(rl, 'Install Playwright skills? [y/N]: ');
  const installPlaywright = playwrightAnswer.toLowerCase() === 'y' || playwrightAnswer.toLowerCase() === 'yes';

  rl.close();
  console.log('');

  const vars = {
    DDEV_PROJECT: projectName,
    SITE_URL: siteUrl,
    PHP_VERSION: phpVersion,
    MARIADB_VERSION: mariadbVersion,
    DRUPAL_PATH: drupalPath,
    DRUPAL_WEBROOT: drupalWebroot,
  };

  const claudeDir = path.join(CWD, '.claude');
  if (!fs.existsSync(claudeDir)) fs.mkdirSync(claudeDir, { recursive: true });

  const log = { copied: [], identical: [] };

  const PLAYWRIGHT_SKILLS = new Set(['playwright-cli', 'issue-record-screenshot']);

  // Skills — render path vars; playwright skills are opt-in
  copyDirMerge(
    path.join(PACKAGE_ROOT, 'skills'),
    path.join(claudeDir, 'skills'),
    vars,
    log,
    installPlaywright ? new Set() : PLAYWRIGHT_SKILLS
  );

  // Agents — render {{...}} placeholders
  copyDirMerge(
    path.join(PACKAGE_ROOT, 'agents'),
    path.join(claudeDir, 'agents'),
    vars,
    log
  );

  // settings.json
  copyFile(
    renderTemplate(path.join(PACKAGE_ROOT, 'templates', 'settings.json.template'), vars),
    path.join(claudeDir, 'settings.json'),
    log
  );

  // CLAUDE.md
  copyFile(
    renderTemplate(path.join(PACKAGE_ROOT, 'templates', 'CLAUDE.md.template'), vars),
    path.join(CWD, 'CLAUDE.md'),
    log
  );

  // Playwright — patch agent and settings.json when opted in
  if (installPlaywright) {
    const agentPath = path.join(claudeDir, 'agents', 'drupal-issue-agent.md');
    try {
      let agentContent = fs.readFileSync(agentPath, 'utf8');
      if (!agentContent.includes('  - playwright-cli')) {
        agentContent = agentContent
          .replace('  - drupal-issue-start\n  - issue-record-update\n', '  - drupal-issue-start\n  - issue-record-update\n  - issue-record-screenshot\n')
          .replace('  - drupal-php-changes\n', '  - drupal-php-changes\n  - playwright-cli\n');
        fs.writeFileSync(agentPath, agentContent);
      }
    } catch (e) {
      console.warn('  ⚠️  Could not patch playwright skills into agent file:', e.message);
    }

    const settingsPath = path.join(claudeDir, 'settings.json');
    try {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      const playwrightPerms = [
        'mcp__plugin_playwright_playwright__*',
        'Bash(playwright-cli *)',
        'Skill(playwright-cli)',
        'Skill(playwright-cli:*)',
        'Skill(issue-record-screenshot)',
        'Skill(issue-record-screenshot:*)',
      ];
      const allow = settings.permissions?.allow ?? [];
      for (const p of playwrightPerms) {
        if (!allow.includes(p)) allow.push(p);
      }
      if (!settings.permissions) settings.permissions = {};
      settings.permissions.allow = allow;
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
    } catch (e) {
      console.warn('  ⚠️  Could not patch playwright permissions into settings.json:', e.message);
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n── Summary ──────────────────────────────────────────────────');

  if (log.copied.length) {
    console.log('\nCreated / updated:');
    for (const f of log.copied) console.log(`  ✓  ${f}`);
  }

  if (log.identical.length) {
    console.log('\nAlready up to date:');
    for (const f of log.identical) console.log(`  =  ${f}`);
  }

  let doneMsg = '\nDone. Open this project in Claude Code and paste a Drupal.org issue URL — or run /drupal-issue-start <url> to get started.';
  if (installPlaywright) {
    doneMsg += '\n\nPlaywright skills installed. To use them, make sure playwright-cli is available:\n  npm install -g @playwright/cli@latest';
  }
  console.log(doneMsg + '\n');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
