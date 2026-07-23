#!/usr/bin/env node

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');

const PACKAGE_ROOT = path.join(__dirname, '..');
const CWD = process.cwd();
const LOCK_FILE = path.join(CWD, '.claude', 'claude-skills.lock.json');

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

function readLock() {
  try { return JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8')).vars || {}; } catch (_) { return {}; }
}

function writeLock(vars) {
  fs.mkdirSync(path.dirname(LOCK_FILE), { recursive: true });
  fs.writeFileSync(LOCK_FILE, JSON.stringify({ lockedAt: new Date().toISOString(), vars }, null, 2));
}

function findBin(name) {
  try { return execSync(`which ${name}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim(); } catch (_) { return null; }
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🎸 drupal-claude-skills setup\n');

  const lock = readLock();

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  // ── Step 1: Where is Drupal? ───────────────────────────────────────────────
  let drupalSubdir;
  if (isDrupalRoot(CWD)) {
    drupalSubdir = '.';
    console.log('Drupal project detected at current directory.\n');
  } else {
    const detected = findDrupalSubdir(CWD);
    const defaultSubdir = lock.DRUPAL_SUBDIR || detected || '.';
    const hint = detected ? `${detected} (auto-detected)` : defaultSubdir;
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
  const defaultProject = lock.DDEV_PROJECT || detectedProject;
  const projectName = await ask(rl, `DDEV project name [${defaultProject}]: `) || defaultProject;
  const defaultUrl = lock.SITE_URL || `https://${projectName}.ddev.site`;
  const siteUrl = await ask(rl, `Site URL [${defaultUrl}]: `) || defaultUrl;
  const phpVersion = await ask(rl, `PHP version [${lock.PHP_VERSION || '8.4'}]: `) || lock.PHP_VERSION || '8.4';
  const mariadbVersion = await ask(rl, `MariaDB version [${lock.MARIADB_VERSION || '11.8'}]: `) || lock.MARIADB_VERSION || '11.8';

  // ── Humanizer skill ────────────────────────────────────────────────────────
  const hasHumanizer = fs.existsSync(path.join(os.homedir(), '.claude', 'skills', 'humanizer', 'SKILL.md'));
  if (!hasHumanizer) {
    console.log('\n⚠  humanizer skill not found in ~/.claude/skills/humanizer/');
    console.log('   drupalorg-comment-format uses it to strip AI writing patterns from comments.');
    console.log('   Install it globally in ~/.claude/skills/ and re-run setup to pick it up.');
    const ans = await ask(rl, '   Continue without humanizer? [Y/n]: ');
    if (ans.toLowerCase() === 'n') {
      rl.close();
      console.log('\nSetup aborted. Install humanizer and re-run.\n');
      process.exit(0);
    }
  }

  rl.close();
  console.log('');

  const drupalorgBin = findBin('drupalorg') || '/path/to/drupalorg';

  const vars = {
    DDEV_PROJECT: projectName,
    SITE_URL: siteUrl,
    PHP_VERSION: phpVersion,
    MARIADB_VERSION: mariadbVersion,
    DRUPAL_PATH: drupalPath,
    DRUPAL_WEBROOT: drupalWebroot,
    DRUPAL_SUBDIR: drupalSubdir,
    DRUPAL_CLI_BIN: drupalorgBin,
  };

  const claudeDir = path.join(CWD, '.claude');
  if (!fs.existsSync(claudeDir)) fs.mkdirSync(claudeDir, { recursive: true });

  const log = { copied: [], identical: [] };

  // Skills — copied as-is; skills read project paths from CLAUDE.md context
  copyDirMerge(
    path.join(PACKAGE_ROOT, 'skills'),
    path.join(claudeDir, 'skills'),
    null,
    log
  );

  // Agents — copied as-is; project paths come from CLAUDE.md context
  copyDirMerge(
    path.join(PACKAGE_ROOT, 'agents'),
    path.join(claudeDir, 'agents'),
    null,
    log
  );

  // Externally-maintained skills — pulled at install time, never vendored in
  // this repo. Each pull is non-fatal: offline/npx failures print a manual
  // install command and setup continues.
  const externalSkills = [
    {
      name: 'playwright-cli',
      repo: 'microsoft/playwright-cli',
      usedBy: 'The drupal-e2e-tester agent needs it for browser e2e tests.',
    },
    {
      name: 'drupalorg-cli',
      repo: 'mglaman/drupalorg-cli',
      usedBy: 'drupal-issue-start and other skills need it for Drupal.org issue/MR data.',
    },
    {
      name: 'drupalorg-issue-search',
      repo: 'mglaman/drupalorg-cli',
      usedBy: 'Searching Drupal.org issues by keyword across the API, issue-queue scrape, and web search.',
    },
  ];

  for (const { name, repo, usedBy } of externalSkills) {
    const skillFile = path.join(claudeDir, 'skills', name, 'SKILL.md');
    if (fs.existsSync(skillFile)) {
      log.identical.push(path.relative(CWD, skillFile) + ' (update with: npx skills update)');
      continue;
    }
    console.log(`Pulling ${name} skill from github.com/${repo} …`);
    try {
      execSync(
        `npx -y skills@latest add ${repo} --skill ${name} --agent claude-code --copy -y`,
        { cwd: CWD, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' }
      );
      if (fs.existsSync(skillFile)) {
        log.copied.push(path.relative(CWD, skillFile));
      } else {
        throw new Error('skill not found after install');
      }
    } catch (_) {
      console.log(`⚠  Could not pull the ${name} skill (offline or npx unavailable).`);
      console.log(`   ${usedBy} Install later with:`);
      console.log(`   npx skills add ${repo} --skill ${name}\n`);
    }
  }


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

  writeLock(vars);

  if (drupalorgBin === '/path/to/drupalorg') {
    console.log('\n⚠  drupalorg not found on PATH — install it and re-run setup to activate the drupalorg-cli MCP server.');
  }
  console.log('\nDone. Open this project in Claude Code and paste a Drupal.org issue URL — or run /drupal-issue-start <url> to get started.\n');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
