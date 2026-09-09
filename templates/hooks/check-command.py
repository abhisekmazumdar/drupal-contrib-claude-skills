#!/usr/bin/env python3
"""Best-effort shell guard shared by Claude Code and Codex (not a sandbox).

Inspect commands without executing them. Recognizes Git global options,
compound shell commands, and explicit shell -c wrappers. Does not resolve
aliases, variable expansion, interactive stdin, or arbitrary script contents.
"""

import json
import os
import shlex
import sys


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
                if tokens[j].startswith('-') and 'c' in tokens[j][1:]:
                    reason = blocked(tokens[j + 1], depth + 1)
                    if reason:
                        return reason
                    break
                if not tokens[j].startswith('-'):
                    break
        if binary not in ('git', 'glab'):
            continue
        end = next((j for j in range(index + 1, len(tokens))
                    if tokens[j] and all(c in ';&|()<>\n' for c in tokens[j])), len(tokens))
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
