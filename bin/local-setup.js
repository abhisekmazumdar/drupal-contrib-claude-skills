'use strict';

// Personal settings from a git-ignored local.json at the package root, applied
// to every workspace this clone installs into. Only exists in a local clone:
// `npx github:...` fetches a fresh copy without it, so this is a no-op there.
//
//   { "workLogCommand": "/abs/path/to/command", "workspaces": ["/abs/ws", ...] }
//
// Nothing here is toolkit-owned output, so none of it goes through writer()
// or the lockfile: each file is created or extended, never overwritten.

const fs = require('fs');
const path = require('path');
const { symlinkAncestor } = require('./install');

const WORK_LOG = path.join('.drupal-contrib', 'work-log.md');
const SETTINGS_LOCAL = path.join('.claude', 'settings.local.json');

function readLocal(file) {
  if (!fs.existsSync(file)) return null;
  const local = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (local.workLogCommand !== undefined && (typeof local.workLogCommand !== 'string' || !path.isAbsolute(local.workLogCommand))) {
    throw new Error(`${file}: workLogCommand must be an absolute path`);
  }
  if (local.workspaces !== undefined && !Array.isArray(local.workspaces)) {
    throw new Error(`${file}: workspaces must be an array`);
  }
  return local;
}

function applyLocal({ cwd, file, targets, dryRun }) {
  const local = readLocal(file);
  if (!local) return [];
  const done = [];
  const safe = (rel) => !symlinkAncestor(cwd, path.join(cwd, rel));

  if (local.workLogCommand) {
    const workLog = path.join(cwd, WORK_LOG);
    if (!fs.existsSync(workLog) && safe(WORK_LOG)) {
      if (!dryRun) {
        fs.mkdirSync(path.dirname(workLog), { recursive: true });
        fs.writeFileSync(workLog, `# Command that logs issue URLs; see the toolkit docs (Work log).\n${local.workLogCommand}\n`);
      }
      done.push(WORK_LOG);
    }

    if (targets.includes('claude-code') && safe(SETTINGS_LOCAL)) {
      const settingsFile = path.join(cwd, SETTINGS_LOCAL);
      const settings = fs.existsSync(settingsFile) ? JSON.parse(fs.readFileSync(settingsFile, 'utf8')) : {};
      const rule = `Bash(${local.workLogCommand}:*)`;
      settings.permissions = settings.permissions || {};
      const allow = settings.permissions.allow = settings.permissions.allow || [];
      if (!allow.includes(rule)) {
        allow.push(rule);
        if (!dryRun) {
          fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
          fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2) + '\n');
        }
        done.push(`${SETTINGS_LOCAL} (allow work-log command)`);
      }
    }
  }

  const workspaces = local.workspaces || [];
  if (!workspaces.includes(cwd)) {
    if (!dryRun) {
      local.workspaces = [...workspaces, cwd].sort();
      fs.writeFileSync(file, JSON.stringify(local, null, 2) + '\n');
    }
    done.push(`${path.basename(file)} (recorded this workspace)`);
  }
  return done;
}

module.exports = { applyLocal, readLocal };
