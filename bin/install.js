'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const hash = content => crypto.createHash('sha256').update(content).digest('hex');
const quote = value => `'${value.replace(/'/g, "'\\''")}'`;

function options(args) {
  const result = { target: null, dryRun: false, yes: false, skipExternal: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--target') result.target = args[++i];
    else if (arg.startsWith('--target=')) {
      result.target = arg.slice(9);
      if (!result.target) throw new Error('--target needs a value');
    }
    else if (arg === '--dry-run') result.dryRun = true;
    else if (arg === '--yes') result.yes = true;
    else if (arg === '--skip-external') result.skipExternal = true;
    else if (arg === '--help' || arg === '-h') result.help = true;
    else throw new Error(`Unknown option: ${arg}`);
    if (arg === '--target' && !result.target) throw new Error('--target needs a value');
  }
  if (result.target && !['claude-code', 'codex', 'both'].includes(result.target)) {
    throw new Error('--target must be claude-code, codex, or both');
  }
  return result;
}

function readState(cwd) {
  for (const file of ['.drupal-contrib/install.json', '.claude/claude-skills.lock.json']) {
    const absolute = path.join(cwd, file);
    if (!fs.existsSync(absolute)) continue;
    let state;
    try { state = JSON.parse(fs.readFileSync(absolute, 'utf8')); }
    catch (err) {
      // A partially written or hand-edited lockfile shouldn't hard-fail every
      // future run — fall back to a fresh install the way the pre-refactor
      // readLock() did.
      console.error(`Warning: could not read ${file} (${err.message}); ignoring it and starting fresh.`);
      continue;
    }
    if (file.startsWith('.drupal-contrib/') && state.version !== 1) {
      throw new Error(`Unsupported installation state version in ${file}`);
    }
    // The pre-refactor lockfile never tracked per-file hashes (no `files`
    // key) — flag it so writer() can trust its existing package-owned files
    // instead of treating every one of them as a conflicting user edit.
    if (!file.startsWith('.drupal-contrib/')) state.legacy = true;
    return state;
  }
  return {};
}

// Never follow destination symlinks, including a linked parent directory.
function symlinkAncestor(cwd, destination) {
  let current = destination;
  while (current !== cwd) {
    try { if (fs.lstatSync(current).isSymbolicLink()) return current; }
    catch (err) { if (err.code !== 'ENOENT') throw err; }
    const parent = path.dirname(current);
    if (parent === current) throw new Error(`Destination outside workspace: ${destination}`);
    current = parent;
  }
  return null;
}

function writer(cwd, previous = {}, dryRun = false, { trustUnknown = false } = {}) {
  const files = { ...previous };
  const log = { copied: [], identical: [], conflicts: [] };
  function write(relative, content, mode) {
    const destination = path.resolve(cwd, relative);
    if (!destination.startsWith(cwd + path.sep)) throw new Error(`Invalid destination: ${relative}`);
    const linked = symlinkAncestor(cwd, destination);
    const exists = !linked && fs.existsSync(destination);
    const old = exists && fs.statSync(destination).isFile() ? fs.readFileSync(destination, 'utf8') : null;
    if (!linked && old === content) {
      files[relative] = hash(content);
      log.identical.push(relative);
      if (mode && !dryRun) fs.chmodSync(destination, mode);
      return;
    }
    // A file absent from `previous` (no recorded hash) is either genuinely
    // foreign, or — when migrating a legacy lockfile that never tracked
    // hashes — one of our own files that trustUnknown says to update rather
    // than flag as a conflict.
    const known = Object.prototype.hasOwnProperty.call(previous, relative);
    const isConflict = old !== null && (known ? previous[relative] !== hash(old) : !trustUnknown);
    if (linked || (exists && (old === null || isConflict))) {
      // Store proposals outside either client's discovery/config directories.
      let proposal = path.join(cwd, '.drupal-contrib', 'proposals', relative);
      if (symlinkAncestor(cwd, proposal)) throw new Error(`Unsafe proposal path: ${proposal}`);
      if (fs.existsSync(proposal) && (!fs.statSync(proposal).isFile() || fs.readFileSync(proposal, 'utf8') !== content)) {
        proposal += `.proposed-${hash(content).slice(0, 12)}`;
      }
      log.conflicts.push(`${relative} (preserved; proposal: ${path.relative(cwd, proposal)})`);
      if (!dryRun) {
        if (symlinkAncestor(cwd, proposal)) throw new Error(`Unsafe proposal path: ${proposal}`);
        fs.mkdirSync(path.dirname(proposal), { recursive: true });
        if (!fs.existsSync(proposal)) fs.writeFileSync(proposal, content, { mode: mode || 0o644, flag: 'wx' });
        else if (fs.readFileSync(proposal, 'utf8') !== content) throw new Error(`Proposal was edited: ${proposal}`);
      }
      return;
    }
    log.copied.push(relative);
    files[relative] = hash(content);
    if (!dryRun) {
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, content);
      if (mode) fs.chmodSync(destination, mode);
    }
  }
  function copy(source, destination, exclude = new Set()) {
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
      if (exclude.has(entry.name)) continue;
      const src = path.join(source, entry.name);
      const dest = path.join(destination, entry.name);
      if (entry.isDirectory()) copy(src, dest);
      else write(dest, fs.readFileSync(src, 'utf8'));
    }
  }
  return { write, copy, files, log };
}

function agentToml(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error('Invalid agent frontmatter');
  const [, metadata, body] = match;
  const name = metadata.match(/^name:\s*(\S+)/m)?.[1];
  const description = metadata.match(/^description: >\n((?:[ \t]+[^\n]*\n)+)/m)?.[1].trim().replace(/\s+/g, ' ');
  if (!name || !description) throw new Error('Missing agent name or description');
  const dependencies = [...metadata.matchAll(/^  - (\S+)$/gm)].map(m => m[1]);
  const tools = metadata.match(/^tools:\s*(.+)$/m)?.[1].trim();
  // Codex's .toml agent format has no structural tool-allowlist field, so the
  // frontmatter `tools:` restriction (e.g. drupal-e2e-tester's report-only
  // guarantee — no Edit) can only be carried forward as an explicit,
  // enumerated instruction, not dropped silently.
  const toolsClause = tools
    ? `You may only use these tools: ${tools}. Never use any other tool, including file-edit or patch-apply tools, even if one would otherwise seem available or convenient.`
    : '';
  const instructions = `Read .drupal-contrib/context.md before acting. Resolve <skills-root> to .agents/skills and load the relevant installed skills by name. Use Codex tools, not Claude tool names. ${toolsClause} Dependencies: ${dependencies.join(', ')}. If an upstream skill requires unavailable tools, report that limitation and use a supported equivalent only when it preserves the requested behavior. Delegate the named roles using native subagents; if custom roles are unavailable, pass the full corresponding .drupal-contrib/agents/<name>.md procedure to a fresh subagent. Never silently replace independent testing with self-verification.\n\n${body}`;
  // JSON basic strings are valid TOML strings, including escaped newlines.
  return `name = ${JSON.stringify(name)}\ndescription = ${JSON.stringify(description)}\ndeveloper_instructions = ${JSON.stringify(instructions)}\n`;
}

function installTargets({ cwd, packageRoot, targets, output, render, vars }) {
  output.copy(path.join(packageRoot, 'agents'), '.drupal-contrib/agents');
  output.write('.drupal-contrib/context.md', render(path.join(packageRoot, 'templates', 'context.md.template'), vars));
  for (const target of targets) {
    const claude = target === 'claude-code';
    const root = claude ? '.claude' : '.codex';
    output.copy(path.join(packageRoot, 'skills'), claude ? '.claude/skills' : '.agents/skills');
    const hookPath = path.join(cwd, root, 'hooks', 'block-dangerous-git.sh');
    // block-dangerous-git.sh needs the executable bit, so it's written
    // separately with a mode; exclude it here to avoid writing (and
    // logging) it twice.
    output.copy(path.join(packageRoot, 'templates', 'hooks'), `${root}/hooks`, new Set(['block-dangerous-git.sh']));
    output.write(`${root}/hooks/block-dangerous-git.sh`, fs.readFileSync(path.join(packageRoot, 'templates/hooks/block-dangerous-git.sh'), 'utf8'), 0o755);
    const instruction = claude ? 'CLAUDE.md' : 'AGENTS.md';
    output.write(instruction, fs.readFileSync(path.join(packageRoot, 'templates', `${instruction}.template`), 'utf8'));
    if (claude) {
      output.copy(path.join(packageRoot, 'agents'), '.claude/agents');
      // Serialize after substitution so quotes/backslashes in executable paths remain valid JSON.
      const settings = JSON.parse(fs.readFileSync(path.join(packageRoot, 'templates/settings.json.template'), 'utf8'));
      settings.hooks.PreToolUse[0].hooks[0].command = `bash ${quote(hookPath)}`;
      output.write('.claude/settings.json', JSON.stringify(settings, null, 2) + '\n');
      const mcp = JSON.parse(fs.readFileSync(path.join(packageRoot, 'templates/mcp.json.template'), 'utf8'));
      mcp.mcpServers['drupalorg-cli'].args[0] = vars.DRUPAL_CLI_BIN;
      output.write('.mcp.json', JSON.stringify(mcp, null, 2) + '\n');
    } else {
      output.write('.codex/rules/contribution.rules', fs.readFileSync(path.join(packageRoot, 'templates/codex/contribution.rules'), 'utf8'));
      const config = fs.readFileSync(path.join(packageRoot, 'templates/codex/config.toml.template'), 'utf8');
      // A function replacer is used (not a string) so `$&`/`$1`-style
      // sequences that might appear in a detected binary path are inserted
      // literally instead of being interpreted as replacement patterns.
      output.write('.codex/config.toml', config.replace('{{DRUPAL_CLI_BIN}}', () => JSON.stringify(vars.DRUPAL_CLI_BIN)));
      const hooks = JSON.parse(fs.readFileSync(path.join(packageRoot, 'templates/codex/hooks.json.template'), 'utf8'));
      hooks.hooks.PreToolUse[0].hooks[0].command = `bash ${quote(hookPath)}`;
      output.write('.codex/hooks.json', JSON.stringify(hooks, null, 2) + '\n');
      for (const file of fs.readdirSync(path.join(packageRoot, 'agents'))) {
        if (!file.endsWith('.md')) continue;
        output.write(`.codex/agents/${file.replace(/\.md$/, '.toml')}`, agentToml(fs.readFileSync(path.join(packageRoot, 'agents', file), 'utf8')));
      }
    }
  }
}

module.exports = { options, readState, writer, installTargets, agentToml, symlinkAncestor };
