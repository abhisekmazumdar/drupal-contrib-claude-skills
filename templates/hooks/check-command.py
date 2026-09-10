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
            if verb == 'api':
                # `glab api` defaults to a GET read; only an explicit
                # non-GET method is a write. settings.json.template allows
                # `glab api*` reads at the ask tier — don't block those.
                method = 'GET'
                for k, a in enumerate(args):
                    if a in ('-X', '--method') and k + 1 < len(args):
                        method = args[k + 1].upper()
                    elif a.startswith('--method='):
                        method = a.split('=', 1)[1].upper()
                if method != 'GET':
                    return 'Public GitLab writes and pipeline triggers are reserved for the human.'
                continue
            action_index = arguments(args, 0, {'-R', '--repo', '--hostname', '--host'})
            action = args[action_index] if action_index < len(args) else ''
            denied = {
                'mr': {'create', 'merge', 'approve', 'update', 'close'},
                'issue': {'create', 'update', 'close'},
                'pipeline': {'run'}, 'ci': {'run'},
            }
            if action in denied.get(verb, set()):
                return 'Public GitLab writes and pipeline triggers are reserved for the human.'
            if verb in ('mr', 'issue') and action in ('note', 'comment'):
                # `glab mr note list`/`glab issue note list` are reads
                # (settings.json.template allows `glab mr note*`/`glab issue
                # note*`); any other sub-action (bare, or "create") posts.
                sub_action = args[action_index + 1] if action_index + 1 < len(args) else ''
                if sub_action != 'list':
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
