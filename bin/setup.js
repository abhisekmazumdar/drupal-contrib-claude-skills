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

function renderTemplate(templatePath, vars) {
  let content = fs.readFileSync(templatePath, 'utf8');
  for (const [key, value] of Object.entries(vars)) {
    content = content.split(`{{${key}}}`).join(value);
  }
  return content;
}

/**
 * Returns lines present in destContent but absent from srcContent (non-empty
 * lines only). A non-empty result means the destination has content that would
 * be lost if we overwrote it — a conflict the user must resolve.
 */
function linesOnlyInDest(srcContent, destContent) {
  const srcLines = new Set(srcContent.split('\n'));
  return destContent
    .split('\n')
    .filter(line => line.trim() !== '' && !srcLines.has(line));
}

/**
 * Safe-copy a single file.
 *
 * Decision table (when --force is NOT set):
 *   dest does not exist          → copy   (new file)
 *   dest identical to src        → copy   (no-op write, keeps log clean)
 *   src has content dest lacks   → copy   (source is ahead — safe update)
 *   dest has content src lacks   → SKIP   (conflict — destination is ahead)
 *
 * With --force: always overwrite without checking.
 *
 * @returns {'copied'|'identical'|'skipped'|'conflict'}
 */
function safeCopyFile(srcContent, destPath, log) {
  const rel = path.relative(CWD, destPath);

  if (FORCE) {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, srcContent);
    log.copied.push(rel);
    return 'copied';
  }

  if (!fs.existsSync(destPath)) {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, srcContent);
    log.copied.push(rel);
    return 'copied';
  }

  const destContent = fs.readFileSync(destPath, 'utf8');

  if (destContent === srcContent) {
    log.identical.push(rel);
    return 'identical';
  }

  const lost = linesOnlyInDest(srcContent, destContent);
  if (lost.length > 0) {
    // Destination has unique content — do not overwrite.
    log.conflicts.push({ file: rel, lostLines: lost });
    return 'conflict';
  }

  // Source is ahead — safe to update.
  fs.writeFileSync(destPath, srcContent);
  log.copied.push(rel);
  return 'copied';
}

function copyDirMerge(src, dest, vars, log) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirMerge(srcPath, destPath, vars, log);
    } else {
      const srcContent = vars ? renderTemplate(srcPath, vars) : fs.readFileSync(srcPath, 'utf8');
      safeCopyFile(srcContent, destPath, log);
    }
  }
}

function ask(rl, question) {
  return new Promise(resolve => rl.question(question, answer => resolve(answer.trim())));
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🎸 drupal-claude-skills setup\n');

  if (!isDrupalRoot(CWD)) {
    console.warn('⚠️  Warning: this directory does not look like a Drupal project root.');
    console.warn('   (No web/ directory and no composer.json with drupal/* dependencies found.)');
    console.warn('   You can still continue — files will be written to the current directory.\n');
  }

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

  const claudeDir = path.join(CWD, '.claude');
  if (!fs.existsSync(claudeDir)) fs.mkdirSync(claudeDir, { recursive: true });

  const log = { copied: [], identical: [], conflicts: [] };

  // Skills — no template vars in skill files
  copyDirMerge(
    path.join(PACKAGE_ROOT, 'skills'),
    path.join(claudeDir, 'skills'),
    null,
    log
  );

  // Agents — render {{...}} placeholders
  copyDirMerge(
    path.join(PACKAGE_ROOT, 'agents'),
    path.join(claudeDir, 'agents'),
    vars,
    log
  );

  // settings.json
  const settingsContent = renderTemplate(
    path.join(PACKAGE_ROOT, 'templates', 'settings.json.template'),
    vars
  );
  safeCopyFile(settingsContent, path.join(claudeDir, 'settings.json'), log);

  // CLAUDE.md — never overwritten without --force (it is project-specific and
  // heavily customised after first install; use --force to deliberately refresh it).
  const claudeMdDest = path.join(CWD, 'CLAUDE.md');
  const claudeMdContent = renderTemplate(
    path.join(PACKAGE_ROOT, 'templates', 'CLAUDE.md.template'),
    vars
  );

  if (fs.existsSync(claudeMdDest) && !FORCE) {
    log.identical.push('CLAUDE.md (project-customised — use --force to refresh)');
  } else {
    safeCopyFile(claudeMdContent, claudeMdDest, log);
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

  if (log.conflicts.length) {
    console.log('\n⚠️  Conflicts — destination has content not in source (skipped to avoid data loss):');
    for (const { file, lostLines } of log.conflicts) {
      console.log(`\n  ✗  ${file}`);
      console.log('     Lines that exist in destination but not in source:');
      for (const line of lostLines.slice(0, 8)) {
        console.log(`       ${line}`);
      }
      if (lostLines.length > 8) {
        console.log(`       … and ${lostLines.length - 8} more line(s)`);
      }
    }
    console.log('\n  Review the conflicts above, then re-run with --force to overwrite if intentional.\n');
  } else {
    console.log('\nDone. Open this project in Claude Code and paste a Drupal.org issue URL — or run /drupal-issue-start <url> to get started.\n');
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
