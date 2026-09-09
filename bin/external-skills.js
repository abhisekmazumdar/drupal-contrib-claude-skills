'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

function installExternal({ cwd, targets, entries, output, dryRun, skipExternal, run = execFileSync }) {
  const lockFile = path.join(cwd, 'skills-lock.json');
  let lock = { version: 1, skills: {} };
  let lockChanged = false;
  if (fs.existsSync(lockFile)) {
    try { lock = JSON.parse(fs.readFileSync(lockFile, 'utf8')); }
    catch (_) { lock = null; }
    if (lock?.version !== 1 || !lock.skills || typeof lock.skills !== 'object') lock = null;
  }
  const grouped = new Map();
  for (const entry of entries) {
    if (!grouped.has(entry.repo)) grouped.set(entry.repo, []);
    grouped.get(entry.repo).push(entry);
  }
  for (const target of targets) {
    const root = target === 'codex' ? '.agents/skills' : '.claude/skills';
    for (const [repo, skills] of grouped) {
      const pending = skills.filter(({ name }) => !fs.existsSync(path.join(cwd, root, name, 'SKILL.md')));
      if (pending.length) {
        const args = ['-y', 'skills@latest', 'add', repo, ...pending.flatMap(({ name }) => ['--skill', name]), '--agent', target, '--copy', '-y'];
        if (dryRun || skipExternal) {
          console.log(`External skills (${target}), not downloaded: npx ${args.join(' ')}`);
        } else {
          // Upstream installers never run against the user's existing skills/config.
          const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'drupal-external-'));
          try {
            console.log(`Pulling ${pending.map(e => e.name).join(', ')} for ${target} from ${repo}`);
            try {
              run('npx', args, { cwd: stage, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', timeout: 120000 });
            } catch (_) {
              // A partial download can still provide useful skills. Verify each one.
            }
            for (const { name, usedBy } of pending) {
              const source = path.join(stage, root, name);
              if (fs.existsSync(path.join(source, 'SKILL.md'))) output.copy(source, path.join(root, name));
              else {
                console.log(`Could not install ${name} for ${target}. ${usedBy}`);
                console.log(`Install later: npx skills add ${repo} --skill ${name} --agent ${target} --copy -y`);
              }
            }
            const stagedLock = path.join(stage, 'skills-lock.json');
            if (fs.existsSync(stagedLock)) {
              let downloaded;
              try { downloaded = JSON.parse(fs.readFileSync(stagedLock, 'utf8')); }
              catch (_) { downloaded = {}; }
              if (lock && downloaded.version === 1 && downloaded.skills) {
                for (const { name } of pending) {
                  if (downloaded.skills[name] && fs.existsSync(path.join(cwd, root, name, 'SKILL.md'))) {
                    lock.skills[name] = downloaded.skills[name];
                    lockChanged = true;
                  }
                }
              } else console.log('Existing or upstream skills-lock.json has an unsupported format; update tracking needs manual integration.');
            }
          } finally {
            fs.rmSync(stage, { recursive: true, force: true });
          }
        }
      }
      if (target !== 'codex') continue;
      for (const { name } of skills) {
        const skill = path.join(cwd, root, name, 'SKILL.md');
        if (!fs.existsSync(skill)) continue;
        const content = fs.readFileSync(skill, 'utf8');
        if (!/^disable-model-invocation:\s*true\s*$/m.test(content)) continue;
        const metadata = path.join(root, name, 'agents/openai.yaml');
        const absolute = path.join(cwd, metadata);
        if (!fs.existsSync(absolute)) output.write(metadata, 'policy:\n  allow_implicit_invocation: false\n');
        else if (!/allow_implicit_invocation:\s*false/.test(fs.readFileSync(absolute, 'utf8'))) {
          console.log(`Review ${metadata}: upstream explicit-only intent needs policy.allow_implicit_invocation: false. Existing metadata was preserved.`);
        }
      }
    }
  }
  if (lockChanged) output.write('skills-lock.json', JSON.stringify(lock, null, 2) + '\n');
}

module.exports = { installExternal };
