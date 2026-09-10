#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');
const { installExternal } = require('./external-skills');
const { options, readState, writer, installTargets, symlinkAncestor } = require('./install');

const PACKAGE_ROOT = path.join(__dirname, '..');
const CWD = process.cwd();
const LOCK_FILE = path.join(CWD, '.drupal-contrib', 'install.json');
const cli = options(process.argv.slice(2));

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

// Returns every top-level subdir of `dir` that is itself a Drupal root —
// not just the first match — so a workspace holding several Drupal
// installs side by side (e.g. drupal/, cms/, umami/) gets all of them
// detected, not silently just one.
function findAllDrupalSubdirs(dir) {
  const found = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      if (isDrupalRoot(path.join(dir, entry.name))) found.push(entry.name);
    }
  } catch (_) {}
  return found;
}

function buildSitesTable(sites, defaultSite) {
  const header = '| Name | Default | DDEV Project | Site URL | Webroot | PHP | MariaDB |\n|---|---|---|---|---|---|---|';
  const rows = Object.entries(sites).map(([name, cfg]) => {
    const isDefault = name === defaultSite ? '✓' : '';
    return `| ${name} | ${isDefault} | ${cfg.ddevProject} | ${cfg.siteUrl} | ${cfg.drupalWebroot}/ | ${cfg.phpVersion} | ${cfg.mariadbVersion} |`;
  });
  return [header, ...rows].join('\n');
}

// Older lockfiles stored one flat var set (DDEV_PROJECT, SITE_URL, ...) for
// a single Drupal install. Wrap that shape into today's { sites, defaultSite }
// shape so existing single-site installs don't have to redo setup.
function normalizeLock(raw) {
  if (raw.sites) return raw;
  if (raw.DDEV_PROJECT) {
    const subdir = raw.DRUPAL_SUBDIR || '.';
    const name = (subdir === '.' || subdir === '') ? path.basename(CWD) : subdir.replace(/\/$/, '');
    return {
      sites: {
        [name]: {
          ddevProject: raw.DDEV_PROJECT,
          siteUrl: raw.SITE_URL,
          phpVersion: raw.PHP_VERSION,
          mariadbVersion: raw.MARIADB_VERSION,
          drupalPath: raw.DRUPAL_PATH || '',
          drupalWebroot: raw.DRUPAL_WEBROOT || 'web',
          drupalSubdir: subdir,
        },
      },
      defaultSite: name,
      drupalCliBin: raw.DRUPAL_CLI_BIN,
    };
  }
  return { sites: {}, defaultSite: null };
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

function ask(rl, question) {
  if (cli.yes || cli.dryRun || !process.stdin.isTTY) return Promise.resolve('');
  return new Promise(resolve => rl.question(question, answer => resolve(answer.trim())));
}

function findBin(name) {
  try { return execSync(`which ${name}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim(); } catch (_) { return null; }
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (cli.help) {
    console.log('Usage: drupal-claude-skills [--target claude-code|codex|both] [--yes] [--dry-run] [--skip-external]');
    console.log('--yes accepts detected defaults; --dry-run previews without writes or downloads.');
    return;
  }
  console.log('\nDrupal contribution toolkit setup\n');
  const state = readState(CWD);
  const lock = normalizeLock(state.vars || {});
  const targets = cli.target === 'both' ? ['claude-code', 'codex']
    : cli.target ? [cli.target] : state.targets || ['claude-code'];
  if (!Array.isArray(targets) || !targets.length || targets.some(target => !['claude-code', 'codex'].includes(target))) throw new Error('Invalid targets in installation state');
  const output = writer(CWD, state.files, cli.dryRun, { trustUnknown: !!state.legacy });
  const log = output.log;

  if (!findBin('python3')) console.log('Warning: Python 3 is required for the command guard; hooks will block shell calls until it is installed.');
  if (!findBin('php')) console.log('Warning: PHP is required on the host to launch the drupalorg-cli MCP server.');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  // ── Step 1: Where is Drupal? One or more installs. ─────────────────────────
  // `siteDirs` is the list of { name, subdir } candidates to configure below.
  // `subdir` is '.' when Drupal lives at the workspace root, or a top-level
  // directory name (e.g. 'cms') when it's nested. `name` is the site's
  // identifier everywhere else in this toolchain (CLAUDE.md's sites table,
  // issue records, skill site-matching) — it's always the directory name
  // (or the workspace's own basename when Drupal is at the root), never a
  // separately-chosen alias.
  let siteDirs;
  if (isDrupalRoot(CWD)) {
    // Toolchain is being set up from inside a Drupal codebase itself (e.g.
    // `cd drupal11 && npx drupal-claude-skills`) — a single site, no
    // sibling subdirs to scan.
    siteDirs = [{ name: path.basename(CWD), subdir: '.' }];
    console.log('Drupal project detected at current directory.\n');
  } else {
    const detected = findAllDrupalSubdirs(CWD);
    if (detected.length === 0) {
      const priorSite = lock.defaultSite && lock.sites[lock.defaultSite];
      const defaultSubdir = (priorSite && priorSite.drupalSubdir) || '.';
      const answer = await ask(rl, `Where is your Drupal project? [${defaultSubdir}]: `);
      const subdir = answer || defaultSubdir;
      const name = (subdir === '.' || subdir === '') ? path.basename(CWD) : subdir.replace(/\/$/, '');
      siteDirs = [{ name, subdir }];
      console.log('');
    } else if (detected.length === 1) {
      siteDirs = [{ name: detected[0], subdir: detected[0] }];
      console.log(`Drupal project detected at ./${detected[0]}\n`);
    } else {
      console.log(`Found ${detected.length} Drupal projects: ${detected.join(', ')}\n`);
      siteDirs = detected.map(d => ({ name: d, subdir: d }));
    }
  }

  // ── Step 2: DDEV + site details, one pass per detected site ───────────────
  const sites = {};
  for (const { name, subdir } of siteDirs) {
    const drupalPath = (subdir === '.' || subdir === '') ? '' : subdir.replace(/\/$/, '') + '/';
    const drupalWebroot = drupalPath + 'web';
    const drupalAbsDir = subdir === '.' ? CWD : path.join(CWD, subdir);
    const existing = lock.sites[name] || {};

    if (siteDirs.length > 1) console.log(`--- Site: ${name} ---`);

    const detectedProject = readDdevProjectName(drupalAbsDir) || path.basename(drupalAbsDir);
    const defaultProject = existing.ddevProject || detectedProject;
    // Always prompt (ask() itself no-ops to '' under --yes/--dry-run/non-TTY)
    // so a re-run can still change a previously recorded value — an existing
    // value is only the *default* answer, not a value that skips the prompt.
    const projectName = await ask(rl, `DDEV project name [${defaultProject}]: `) || defaultProject;
    const defaultUrl = existing.siteUrl || `https://${projectName}.ddev.site`;
    const siteUrl = await ask(rl, `Site URL [${defaultUrl}]: `) || defaultUrl;
    const phpVersion = await ask(rl, `PHP version [${existing.phpVersion || '8.4'}]: `) || existing.phpVersion || '8.4';
    const mariadbVersion = await ask(rl, `MariaDB version [${existing.mariadbVersion || '11.8'}]: `) || existing.mariadbVersion || '11.8';

    sites[name] = { ddevProject: projectName, siteUrl, phpVersion, mariadbVersion, drupalPath, drupalWebroot, drupalSubdir: subdir };
    console.log('');
  }

  // ── Step 3: which site is default? ─────────────────────────────────────────
  let defaultSite;
  if (siteDirs.length === 1) {
    defaultSite = siteDirs[0].name;
  } else {
    const names = siteDirs.map(s => s.name);
    const lockedDefault = names.includes(lock.defaultSite) ? lock.defaultSite : names[0];
    const answer = (names.includes(lock.defaultSite) ? lock.defaultSite : '') || await ask(rl, `Which site is the default? [${lockedDefault}] (${names.join(', ')}): `);
    defaultSite = names.includes(answer) ? answer : lockedDefault;
    console.log('');
  }

  rl.close();

  const drupalorgBin = findBin('drupalorg') || lock.drupalCliBin || '/path/to/drupalorg';
  const defaultSiteCfg = sites[defaultSite];

  const vars = {
    DDEV_PROJECT: defaultSiteCfg.ddevProject,
    SITE_URL: defaultSiteCfg.siteUrl,
    PHP_VERSION: defaultSiteCfg.phpVersion,
    MARIADB_VERSION: defaultSiteCfg.mariadbVersion,
    DRUPAL_PATH: defaultSiteCfg.drupalPath,
    DRUPAL_WEBROOT: defaultSiteCfg.drupalWebroot,
    DRUPAL_SUBDIR: defaultSiteCfg.drupalSubdir,
    DRUPAL_CLI_BIN: drupalorgBin,
    SITES_TABLE: buildSitesTable(sites, defaultSite),
  };

  installTargets({ cwd: CWD, packageRoot: PACKAGE_ROOT, targets, output, render: renderTemplate, vars });

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
      name: 'how',
      repo: 'cursor/plugins',
      usedBy: 'Builds a mental model of unfamiliar contrib code before drupal-issue-agent edits it.',
    },
    {
      name: 'blast-radius',
      repo: 'cursor/plugins',
      usedBy: 'Checks what a change breaks outside the diff before the A9 RTBC verdict.',
    },
    {
      name: 'unslop',
      repo: 'cursor/plugins',
      usedBy: 'Strips AI writing tells from issue comments and commit messages, alongside drupalorg-comment-format.',
    },
    {
      name: 'technical-writing',
      repo: 'cursor/plugins',
      usedBy: 'Layered writing standard for issue summaries, MR descriptions, and commit messages.',
    },
    {
      name: 'interrogate',
      repo: 'cursor/plugins',
      usedBy: 'Adversarial multi-model second opinion on a review verdict, report-only like drupal-e2e-tester.',
    },
    {
      name: 'why',
      repo: 'cursor/plugins',
      usedBy: 'Cited design-rationale digging across VCS/issue-queue evidence, complementing drupal-issue-catchup.',
    },
    {
      name: 'tdd',
      repo: 'cursor/plugins',
      usedBy: 'Red-green discipline for bug fixes with a cheap local test target; skips when the test path is expensive.',
    },
    {
      name: 'diagnosing-bugs',
      repo: 'mattpocock/skills',
      usedBy: 'Phased reproduce/hypothesize/isolate loop for hard bugs before drupal-issue-agent implements a fix.',
    },
    {
      name: 'resolving-merge-conflicts',
      repo: 'mattpocock/skills',
      usedBy: 'Reads each side\'s originating issue/MR before resolving conflicts drupal-issue-reroll surfaces.',
    },
    {
      name: 'wizard',
      repo: 'mattpocock/skills',
      usedBy: 'Turns drupal-repo-setup recon\'s "## Setup issues" block into a runnable fix-it script for the human.',
    },
  ];

  installExternal({
    cwd: CWD, targets, entries: externalSkills, output,
    dryRun: cli.dryRun, skipExternal: cli.skipExternal,
  });

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
    console.log('\nManual integration required (originals were preserved):');
    for (const file of log.conflicts) console.log('  ! ' + file);
    console.log('Review proposals before copying/merging them into their intended locations. Re-run setup afterward to record ownership of matching files.');
  }
  if (!cli.dryRun) {
    if (symlinkAncestor(CWD, LOCK_FILE)) throw new Error('Refusing to write a symlinked installation state');
    fs.mkdirSync(path.dirname(LOCK_FILE), { recursive: true });
    fs.writeFileSync(LOCK_FILE, JSON.stringify({
      version: 1, targets: [...new Set([...(state.targets || []), ...targets])],
      vars: { sites, defaultSite, drupalCliBin: drupalorgBin }, files: output.files,
    }, null, 2) + '\n');
  }

  if (drupalorgBin === '/path/to/drupalorg') {
    console.log('\n⚠  drupalorg not found on PATH — install it and re-run setup to activate the drupalorg-cli MCP server.');
  }
  if (targets.includes('codex')) {
    console.log('Codex: trust this workspace, review/trust the Git hook with /hooks, then use $drupal-issue-start <url>.');
    console.log('Custom agents and PreToolUse hooks require a client supporting those features. Configuration alone does not activate untrusted hooks.');
  }
  if (targets.includes('claude-code')) console.log('Claude Code: use /drupal-issue-start <url>.');
  console.log(cli.dryRun ? '\nPreview only: no files changed or external skills downloaded.' : '\nInstallation files prepared. Resolve any integration notices above before starting issue work.');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
