#!/usr/bin/env python3
"""Best-effort shell guard shared by Claude Code and Codex (not a sandbox).

Inspect commands without executing them. Recognizes Git global options,
compound shell commands, and explicit shell -c wrappers. Does not resolve
aliases, variable expansion, interactive stdin, or arbitrary script contents.
"""

import fnmatch
import json
import os
import re
import shlex
import sys

# Binaries that dump file contents (to the transcript, another file, or a
# remote host). Checked against SECRET_GLOBS/SECRET_DIR_NAMES below. git is
# deliberately not included here — its own verb-based rules live separately,
# and "git show HEAD:.env"-style content access is out of scope for this
# best-effort guard.
READ_BINARIES = {
    'cat', 'less', 'more', 'tac', 'head', 'tail', 'grep', 'egrep', 'fgrep',
    'awk', 'sed', 'strings', 'xxd', 'hexdump', 'od', 'base64',
    'cp', 'scp', 'rsync', 'curl', 'vim', 'vi', 'nano', 'code', 'open', 'pbcopy',
}
# Binaries whose whole purpose is writing their input/args to a file. `cp`,
# `rsync`, etc. above already catch a secret *destination* argument (any
# token in the segment is checked, not just the source), so they aren't
# repeated here. This covers writers that take no filename argument at all —
# the destination only shows up via redirection, which the generic '>'/'>>'
# check below also catches, but `tee`/`dd` name their target directly.
WRITE_BINARIES = {'tee', 'dd', 'install'}
SECRET_GLOBS = ('*.pem', '*.key', '*.pfx', '*.p12', 'id_rsa*', 'id_ed25519*', '.netrc', '.npmrc')
SECRET_DIR_NAMES = ('secrets', '.ssh', '.aws')
# .env.example/.sample/.dist/.template/.defaults are common, non-secret
# checked-in documentation of required vars — don't flag those.
ENV_SAFE_SUFFIXES = ('.example', '.sample', '.dist', '.template', '.defaults', '.test')


def is_secret_path(token):
    if token.startswith('-'):
        return False
    parts = re.split(r'[\\/]', token)
    base = parts[-1]
    if base == '.env' or (base.startswith('.env.') and not base.endswith(ENV_SAFE_SUFFIXES)):
        return True
    if any(fnmatch.fnmatch(base, pattern) for pattern in SECRET_GLOBS):
        return True
    return any(part in SECRET_DIR_NAMES for part in parts[:-1])


def segment_end(tokens, start):
    """Index of the next shell-punctuation token (;, &&, |, ...), or the end."""
    return next((j for j in range(start, len(tokens))
                if tokens[j] and all(c in ';&|()<>\n' for c in tokens[j])), len(tokens))


def arguments(tokens, start, value_options):
    """Skip global options before a subcommand."""
    i = start
    while i < len(tokens) and tokens[i].startswith('-'):
        option = tokens[i]
        i += 1
        if option in value_options:
            i += 1
    return i


def blocked(command, depth=0):
    if depth > 8:
        return 'Shell wrapper nesting exceeds the command guard limit.'
    lexer = shlex.shlex(command, posix=True, punctuation_chars=';&|()<>\n')
    lexer.whitespace_split = True
    tokens = list(lexer)
    for index, token in enumerate(tokens):
        binary = os.path.basename(token)
        if binary in ('bash', 'sh', 'zsh', 'dash'):
            for j in range(index + 1, len(tokens) - 1):
                token = tokens[j]
                if token.startswith('--'):
                    # A long option (e.g. --norc) never carries the -c wrapper
                    # semantics; skip past it instead of matching on any 'c'
                    # in its name, and keep scanning for the real -c.
                    continue
                if token.startswith('-') and 'c' in token[1:]:
                    reason = blocked(tokens[j + 1], depth + 1)
                    if reason:
                        return reason
                    break
                if not token.startswith('-'):
                    break
        if binary in READ_BINARIES:
            end = segment_end(tokens, index + 1)
            if any(is_secret_path(t) for t in tokens[index + 1:end]):
                return 'Reading credentials, keys, or secrets is blocked; use a redacted excerpt instead.'
        if binary in WRITE_BINARIES:
            end = segment_end(tokens, index + 1)
            if any(is_secret_path(t) for t in tokens[index + 1:end]):
                return 'Writing credentials, keys, or secrets is blocked.'
        if token in ('>', '>>') and index + 1 < len(tokens) and is_secret_path(tokens[index + 1]):
            return 'Writing credentials, keys, or secrets is blocked.'
        if binary not in ('git', 'glab'):
            continue
        end = segment_end(tokens, index + 1)
        values = {'-C', '-c', '--git-dir', '--work-tree', '--namespace', '--config-env'} if binary == 'git' else {'-R', '--repo', '--hostname', '--host'}
        sub = arguments(tokens, index + 1, values)
        if sub >= end:
            continue
        verb, args = tokens[sub], tokens[sub + 1:end]
        if binary == 'glab':
            if verb in ('api', 'note'):
                return 'Use the supported read commands; public changes are drafted for the human.'
            action_index = arguments(args, 0, {'-R', '--repo', '--hostname', '--host'})
            action = args[action_index] if action_index < len(args) else ''
            denied = {
                'mr': {'note', 'comment', 'create', 'merge', 'approve', 'update', 'close'},
                'issue': {'create', 'note', 'comment', 'update', 'close'},
                'pipeline': {'run'}, 'ci': {'run'},
            }
            if action in denied.get(verb, set()):
                return 'Public GitLab writes and pipeline triggers are reserved for the human.'
            continue
        flags = {a for a in args if a.startswith('-')}
        short = ''.join(a[1:] for a in flags if not a.startswith('--'))
        if verb == 'reset' and '--hard' in flags:
            return 'git reset --hard discards local work.'
        if verb == 'clean' and ('f' in short or '--force' in flags) and not ('n' in short or '--dry-run' in flags):
            return 'Forced git clean removes untracked files.'
        if verb == 'branch' and ('D' in short or (('d' in short or '--delete' in flags) and ('f' in short or '--force' in flags))):
            return 'Forced branch deletion may discard unmerged work.'
        if verb in ('checkout', 'restore') and any(a in ('.', './', ':/', ':') for a in args):
            return 'Bulk checkout/restore can discard local changes.'
        if verb == 'push' and ('f' in short or '--force' in flags):
            return 'Use an explicitly approved --force-with-lease push instead of --force.'
    return None


def main():
    try:
        event = json.load(sys.stdin)
        command = event.get('tool_input', {}).get('command')
        if not isinstance(command, str):
            raise ValueError('missing tool_input.command')
        reason = blocked(command)
    except (ValueError, TypeError, AttributeError) as error:
        reason = f'Cannot inspect hook input: {error}'
    if reason:
        # Do not echo command arguments: they can contain credentials.
        print('BLOCKED: ' + reason, file=sys.stderr)
        return 2
    return 0


if __name__ == '__main__':
    sys.exit(main())
