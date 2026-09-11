'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const hash = content => crypto.createHash('sha256').update(content).digest('hex');
const quote = value => `'${value.replace(/'/g, "'\\''")}'`;
const escapeRe = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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

function writer(cwd, previous = {}, dryRun = false) {
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
    if (linked || (exists && (old === null || previous[relative] !== hash(old)))) {
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
  // Toolkit-owned files (skills/, agents/, hook scripts) are never meant to
  // be hand-edited in the target project — the source of truth is always
  // this package. Unlike write()/copy() above, forceWrite()/copyManaged()
  // never divert to a `.drupal-contrib/proposals/` stash on drift: they
  // always make the destination match what this version of the package
  // ships, so an update is never silently skipped because a file happened
  // to differ on disk.
  function forceWrite(relative, content, mode) {
    const destination = path.resolve(cwd, relative);
    if (!destination.startsWith(cwd + path.sep)) throw new Error(`Invalid destination: ${relative}`);
    if (symlinkAncestor(cwd, destination)) throw new Error(`Refusing to write through a symlink: ${relative}`);
    const exists = fs.existsSync(destination);
    const old = exists && fs.statSync(destination).isFile() ? fs.readFileSync(destination, 'utf8') : null;
    files[relative] = hash(content);
    if (old === content) {
      log.identical.push(relative);
      if (mode && !dryRun) fs.chmodSync(destination, mode);
      return;
    }
    log.copied.push(relative);
    if (!dryRun) {
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, content);
      if (mode) fs.chmodSync(destination, mode);
    }
  }
  // Removes any relative path under `prefix` that a previous install wrote
  // (per `previous`, the prior lockfile's `files` map) but this run's
  // `written` set didn't reproduce — e.g. a skill or agent dropped upstream
  // disappears from the project too. Only paths this toolkit itself
  // previously wrote are ever touched; a file a user added by hand under
  // the same directory was never recorded in `previous`, so pruning never
  // reaches it.
  function prune(prefix, written) {
    const root = path.resolve(cwd, prefix);
    for (const relative of Object.keys(previous)) {
      if (!relative.startsWith(prefix) || written.has(relative)) continue;
      delete files[relative];
      const absolute = path.resolve(cwd, relative);
      if (!dryRun && !symlinkAncestor(cwd, absolute) && fs.existsSync(absolute)) {
        fs.rmSync(absolute, { force: true });
        // Clean up now-empty directories left behind (e.g. a whole removed
        // skill's folder), stopping at `root` or the first non-empty dir.
        for (let dir = path.dirname(absolute); dir.startsWith(root) && dir !== root; dir = path.dirname(dir)) {
          try { fs.rmdirSync(dir); } catch (_) { break; }
        }
      }
      log.copied.push(`${relative} (removed — no longer shipped)`);
    }
  }
  // Like copy(), but every file is forceWrite()'n and then prune()'d — see
  // above. Recurses into subdirectories (e.g. an agent's `references/`
  // subfolder) unless `shallow` is set, matching only top-level entries
  // (used for Codex's flat `.md` -> `.toml` agent conversion, which has
  // nothing to do with a nested reference file that also happens to end
  // in `.md`).
  //
  // `renameFile(entryName)` maps a source entry name to its destination
  // name (e.g. `foo.md` -> `foo.toml`); returning null/undefined skips that
  // entry entirely. `transformContent(content, entryName)` post-processes
  // the source content (e.g. the .md-frontmatter -> .toml conversion for
  // Codex agents) before it's written. Both default to identity/pass-through.
  function copyManaged(source, destination, exclude = new Set(), { renameFile, transformContent, shallow } = {}) {
    const written = new Set();
    (function walk(src, dest) {
      for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        if (exclude.has(entry.name)) continue;
        const s = path.join(src, entry.name);
        if (entry.isDirectory()) {
          if (!shallow) walk(s, path.join(dest, entry.name));
          continue;
        }
        const outName = renameFile ? renameFile(entry.name) : entry.name;
        if (outName == null) continue;
        const relative = path.join(dest, outName).split(path.sep).join('/');
        let content = fs.readFileSync(s, 'utf8');
        if (transformContent) content = transformContent(content, entry.name);
        forceWrite(relative, content);
        written.add(relative);
      }
    })(source, destination);
    prune(destination.split(path.sep).join('/') + '/', written);
  }
  // Upserts a toolkit-managed block inside a file that may already exist
  // with the target project's own content (CLAUDE.md/AGENTS.md). Everything
  // outside the marker comments is the project's own and is never touched;
  // everything inside is fully replaced on every run so the toolkit summary
  // (skills root, conventions, MCP setup) never goes stale. A file with no
  // markers yet gets the block appended, not overwritten.
  function upsertBlock(relative, content, markerId) {
    const destination = path.resolve(cwd, relative);
    if (!destination.startsWith(cwd + path.sep)) throw new Error(`Invalid destination: ${relative}`);
    if (symlinkAncestor(cwd, destination)) throw new Error(`Refusing to write through a symlink: ${relative}`);
    const begin = `<!-- ${markerId}:begin -->`;
    const end = `<!-- ${markerId}:end -->`;
    const block = `${begin}\n<!-- Managed by ${markerId}. Edits inside this block are overwritten on the next \`npx ${markerId}\` run. -->\n${content.replace(/\n+$/, '')}\n${end}`;
    const exists = fs.existsSync(destination);
    const existing = exists && fs.statSync(destination).isFile() ? fs.readFileSync(destination, 'utf8') : '';
    const markerRe = new RegExp(`${escapeRe(begin)}[\\s\\S]*?${escapeRe(end)}`);
    let next;
    if (markerRe.test(existing)) next = existing.replace(markerRe, block);
    else if (existing.trim()) next = existing.replace(/\n+$/, '') + '\n\n' + block + '\n';
    else next = block + '\n';
    if (next === existing) {
      log.identical.push(relative);
      return;
    }
    log.copied.push(relative);
    if (!dryRun) {
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, next);
    }
  }
  return { write, copy, forceWrite, copyManaged, upsertBlock, prune, files, log };
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
  output.copyManaged(path.join(packageRoot, 'agents'), '.drupal-contrib/agents');
  output.write('.drupal-contrib/context.md', render(path.join(packageRoot, 'templates', 'context.md.template'), vars));
  for (const target of targets) {
    const claude = target === 'claude-code';
    const root = claude ? '.claude' : '.codex';
    output.copyManaged(path.join(packageRoot, 'skills'), claude ? '.claude/skills' : '.agents/skills');
    const hookPath = path.join(cwd, root, 'hooks', 'block-dangerous-git.sh');
    // block-dangerous-git.sh needs the executable bit, so it's written
    // separately with a mode; exclude it here to avoid writing (and
    // logging) it twice.
    output.copyManaged(path.join(packageRoot, 'templates', 'hooks'), `${root}/hooks`, new Set(['block-dangerous-git.sh']));
    output.forceWrite(`${root}/hooks/block-dangerous-git.sh`, fs.readFileSync(path.join(packageRoot, 'templates/hooks/block-dangerous-git.sh'), 'utf8'), 0o755);
    const instruction = claude ? 'CLAUDE.md' : 'AGENTS.md';
    output.upsertBlock(instruction, fs.readFileSync(path.join(packageRoot, 'templates', `${instruction}.template`), 'utf8'), 'drupal-contrib-claude-skills');
    if (claude) {
      output.copyManaged(path.join(packageRoot, 'agents'), '.claude/agents');
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
      output.copyManaged(path.join(packageRoot, 'agents'), '.codex/agents', new Set(), {
        renameFile: file => file.endsWith('.md') ? file.replace(/\.md$/, '.toml') : null,
        transformContent: agentToml,
        shallow: true,
      });
    }
  }
}

module.exports = { options, readState, writer, installTargets, agentToml, symlinkAncestor };
