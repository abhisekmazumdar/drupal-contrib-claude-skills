#!/usr/bin/env python3
"""
Run the GitLab CI cspell, eslint, and stylelint jobs locally, the way
Drupal's gitlab_templates run them, before a push instead of after.

PHPCS/PHPStan already run locally via `ddev exec`. These three only ever
ran in CI, so a single unrecognized word or CSS property order cost a
push, a failed pipeline, and a second push.

By default only the files the push changes are checked: everything that
differs from the base (the MR's target branch via --base, else the
branch's upstream, else origin/HEAD), committed or not, plus untracked
files. Each job only runs when there are files for it: a PHP-only change
runs cspell alone. --all checks the whole module, the way CI does.

What it mirrors from gitlab_templates (includes/include.drupalci.main.yml):
- The module's own `.gitlab-ci.yml` variables: SKIP_CSPELL/SKIP_ESLINT/
  SKIP_STYLELINT, _CSPELL_WORDS/_DICTIONARY/_FLAGWORDS/_IGNORE_PATHS/
  _IGNORE_STANDARD_FILES, and the _*_EXTRA flags.
- cspell: the config gitlab_templates' scripts/prepare-cspell.php builds,
  ported to build_cspell_config() below (as of gitlab_templates commit
  3a85ed35, 2026-10-27), on top of the module's .cspell.json or
  gitlab_templates' assets/.cspell.json default. Nothing is downloaded.
- eslint: core's .eslintrc.passing.json + .eslintrc.jquery.json linked one
  folder above the module, core's .prettierrc.json, '*.yml' .prettierignore.
- stylelint: core's .stylelintrc.json unless the module has its own,
  core's .prettierrc.json, and CI's unquoted `./**/*.css` glob, which bash
  (no globstar) expands to exactly one folder deep: changed CSS anywhere
  else isn't linted in CI either, so it isn't here.
Every command runs inside the DDEV web container, using core's node_modules.

Every file it creates is removed afterwards, even on Ctrl-C. A file that
already exists is never touched or removed.

Usage:
    python3 ci_lint.py <module-dir> [--base <ref>] [--all]
                       [--only cspell,eslint,stylelint] [--include-skipped]
                       [--dry-run]

Exit codes: 0 all run jobs passed (or were skipped), 1 a job failed,
2 usage/environment error, 3 core node_modules missing (run the printed
install command, after approval, then re-run).
"""

import argparse
import json
import os
import re
import shlex
import subprocess
import sys

JOBS = ("cspell", "eslint", "stylelint")
CONTAINER_ROOT = "/var/www/html"
# Must end in .json (cspell picks its parser by extension); *_ignore_* keeps
# CI's always-ignored pattern off it in an --all run.
CSPELL_CONFIG = ".cspell_ignore_ci-lint.json"

# gitlab_templates defaults (includes/include.drupalci.variables.yml).
DEFAULTS = {
    "SKIP_CSPELL": "0",
    "SKIP_ESLINT": "0",
    "SKIP_STYLELINT": "0",
    "_CSPELL_WORDS": "",
    "_CSPELL_DICTIONARY": ".cspell-project-words.txt",
    "_CSPELL_FLAGWORDS": "",
    "_CSPELL_IGNORE_PATHS": "",
    "_CSPELL_IGNORE_STANDARD_FILES": "1",
    "_CSPELL_EXTRA": "",
    "_ESLINT_EXTRA": "",
    "_STYLELINT_EXTRA": "",
}

# gitlab_templates assets/.cspell.json, used when the module has none.
DEFAULT_CSPELL_JSON = {
    "description": "This default CSpell configuration for contrib projects is based on core/.cspell.json. "
                   "Some of the arrays are expanded in scripts/prepare-cspell.php. "
                   "See https://project.pages.drupalcode.org/gitlab_templates/jobs/cspell/ for more details.",
    "language": "en-US",
    "allowCompoundWords": False,
    "globRoot": ".",
    "minWordLength": 4,
    "ignorePaths": [],
    "dictionaries": [],
    "dictionaryDefinitions": [],
    "words": [],
    "flagWords": [
        "blacklist->blocklist, denylist",
        "blacklists->blocklists, denylists",
        "blacklist's->blocklist's, denylist's",
        "blacklisted->blocklisted, denylisted",
        "e-mail",
        "grey",
        "queuing",
        "whitelist:allowlist",
        "whitelists:allowlists",
        "whitelist's:allowlist's",
        "whitelisted:allowlisted",
    ],
    "overrides": [
        {
            "filename": "**/{*.engine,*.inc,*.install,*.module,*.profile,*.theme}",
            "languageId": "php",
        }
    ],
}

# cspell:disable
EXTRA_WORDS = [
    # Local docker integrations.
    "lando", "ddev",
    # Common words dropped from core dictionaries (gitlab_templates #3494834).
    "endapply", "nightwatchjs", "testgroup", "testgroups", "backlinks", "mdhash", "uploaders", "vocabs",
    # Curl options and constants dropped from core dictionaries.
    "curlopt", "returntransfer", "curle", "customrequest", "failonerror", "postfields", "followlocation",
    # PHPCS sniff names/error codes that cannot be corrected (#3418190).
    "colourdefinitionsniff", "seletorsingleline", "teamplatespacingaftercomment", "tforvalue",
    "trhowscommentindentation", "unecessaryfiledeclaration",
    # The suggested alternative for a flagged word.
    "blocklisted",
    # Words in environment variable names (#3572383).
    "flagwords", "mkdocs", "autorun", "runtests", "dcms",
]
DEFAULT_FLAGWORDS = ["blacklist", "blacklists", "blacklisted", "e-mail", "grey", "queuing",
                     "whitelist", "whitelists", "whitelisted"]
# cspell:enable
ALWAYS_IGNORED = ["*.patch", "*.svg", "*_ignore_*", "build.env", "get-file-via-curl.sh",
                  "_cspell_unrecognized_words.txt", "_cspell_updated_project_words.txt"]
STANDARD_IGNORED = ["**/.*.json", "package.json", "yarn.lock", "phpstan*", ".*ignore"]
STANDARD_FILENAMES = ["license", "copyright", "maintainers", "changelog", "composer"]
BUILT_IN_DICTIONARIES = ["companies", "fonts", "html", "php", "softwareTerms", "misc", "typescript",
                         "node", "css", "bash", "filetypes", "npm", "lorem-ipsum", "sql", "fullstack"]


def fail(msg, code=2):
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(code)


def unique(items):
    """PHP array_unique(): keep the first occurrence, preserve order."""
    return list(dict.fromkeys(items))


def strip_comment(value):
    """Drop a trailing ` # comment` that sits outside quotes."""
    quote = None
    for i, ch in enumerate(value):
        if quote:
            if ch == quote:
                quote = None
        elif ch in "'\"":
            quote = ch
        elif ch == "#" and (i == 0 or value[i - 1].isspace()):
            return value[:i].rstrip()
    return value.rstrip()


def unquote(value):
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
        return value[1:-1]
    return value


def read_ci_variables(module_dir):
    """Top-level `variables:` from the module's .gitlab-ci.yml.

    Handles `KEY: value` and the `KEY:\\n    value: x` form. Good enough for
    the flat scalars projects set here; not a general YAML parser.
    """
    found = {}
    path = os.path.join(module_dir, ".gitlab-ci.yml")
    if not os.path.isfile(path):
        return found
    in_vars = False
    var_indent = None
    pending = None
    with open(path, encoding="utf-8", errors="replace") as f:
        for raw in f:
            line = raw.rstrip("\n")
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            indent = len(line) - len(line.lstrip())
            if indent == 0:
                in_vars = line.startswith("variables:")
                var_indent = pending = None
                continue
            if not in_vars:
                continue
            m = re.match(r"^\s+([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$", line)
            if not m:
                continue
            key, value = m.group(1), strip_comment(m.group(2))
            if var_indent is None:
                var_indent = indent
            if indent == var_indent:
                pending = key if value == "" else None
                if value != "":
                    found[key] = unquote(value)
            elif pending and indent > var_indent and key == "value":
                found[pending] = unquote(value)
                pending = None
    return found


def build_cspell_config(module_dir, webroot_rel, project_name, ci_vars):
    """Port of gitlab_templates scripts/prepare-cspell.php (commit 3a85ed35).

    Runs with the module directory as the project root, the way CI runs it
    from $CI_PROJECT_DIR. `webroot_rel` is the webroot relative to the
    module, so core's dictionary paths resolve the same way.
    """
    own = os.path.join(module_dir, ".cspell.json")
    if os.path.isfile(own):
        with open(own, encoding="utf-8") as f:
            cfg = json.load(f)
        if not cfg:
            raise RuntimeError(f"Unable to read {own}")
    else:
        cfg = json.loads(json.dumps(DEFAULT_CSPELL_JSON))

    non_project = [webroot_rel, "vendor", "node_modules", ".git", "recipes"]

    # Words: $_CSPELL_WORDS, then every underscore part of the project name
    # and of each submodule's .info.yml name.
    words = []
    if ci_vars["_CSPELL_WORDS"]:
        raw = ci_vars["_CSPELL_WORDS"].replace('"', "").replace(" ", "")
        raw = ("," + raw + ",").replace(",'", ",").replace("',", ",")
        words = [w for w in raw.split(",") if w and w != "0"]
    name_parts = (project_name + "-").split("-", 1)[0].split("_")
    standard_found = []
    for dirpath, dirnames, filenames in os.walk(module_dir):
        rel_dir = os.path.relpath(dirpath, module_dir)
        if rel_dir == ".":
            # PHP skips files under these per file; pruning gives the same result faster.
            dirnames[:] = [d for d in dirnames if d.lower() not in [n.lower() for n in non_project]]
        for name in filenames:
            pathname = "./" + name if rel_dir == "." else "./" + rel_dir + "/" + name
            if any(f"./{d}/".lower() in pathname.lower() for d in non_project):
                continue
            if ".info.yml" in name.lower():
                name_parts += name.replace(".info.yml", "").split("_")
            stem = name.split(".", 1)[0].lower() if "." in name else ""
            if stem in STANDARD_FILENAMES:
                standard_found.append(pathname)
    cfg["words"] = [w for w in unique((cfg.get("words") or []) + words + name_parts + EXTRA_WORDS)
                    if w and w != "0"]

    # Flag words: the advisory about missing defaults, then $_CSPELL_FLAGWORDS.
    own_flags = [re.split(":", f.replace("->", ":"))[0] for f in (cfg.get("flagWords") or [])]
    missing = [f for f in DEFAULT_FLAGWORDS if f not in own_flags]
    if missing:
        print("[WARNING] This project's .cspell.json lacks default flagged words "
              f"(CI warns too): {', '.join(missing)}")
    if ci_vars["_CSPELL_FLAGWORDS"]:
        extra = ci_vars["_CSPELL_FLAGWORDS"].replace("'", "").replace('"', "").replace(" ", "")
        cfg["flagWords"] = unique((cfg.get("flagWords") or []) + [f for f in extra.split(",") if f and f != "0"])

    # Ignore paths.
    paths = non_project + ALWAYS_IGNORED
    if ci_vars["_CSPELL_IGNORE_STANDARD_FILES"] != "0":
        paths += STANDARD_IGNORED + standard_found
    extra_paths = []
    if ci_vars["_CSPELL_IGNORE_PATHS"]:
        extra_paths = ci_vars["_CSPELL_IGNORE_PATHS"].replace("'", "").replace('"', "").replace(" ", "").split(",")
    cfg["ignorePaths"] = unique((cfg.get("ignorePaths") or []) + paths + extra_paths)

    # Dictionaries: core's two, plus the project's own word list, each only
    # if the file exists.
    definitions = [
        {"name": "drupal", "path": f"{webroot_rel}/core/misc/cspell/drupal-dictionary.txt"},
        {"name": "dictionary", "path": f"{webroot_rel}/core/misc/cspell/dictionary.txt"},
    ]
    if ci_vars["_CSPELL_DICTIONARY"]:
        definitions.append({
            "name": "project-words",
            "path": "./" + ci_vars["_CSPELL_DICTIONARY"],
            "description": "The project's own custom dictionary (optional)",
        })
    definitions = [d for d in definitions if os.path.exists(os.path.join(module_dir, d["path"]))]
    names = [d["name"] for d in definitions]
    cfg["dictionaries"] = unique((cfg.get("dictionaries") or []) + BUILT_IN_DICTIONARIES + names)
    cfg["dictionaryDefinitions"] = definitions + [
        d for d in (cfg.get("dictionaryDefinitions") or []) if d.get("name") not in names
    ]
    return cfg


def find_up(start, predicate):
    d = os.path.abspath(start)
    while True:
        if predicate(d):
            return d
        parent = os.path.dirname(d)
        if parent == d:
            return None
        d = parent


def git(module, *args):
    r = subprocess.run(["git", "-C", module, *args], capture_output=True, text=True)
    return r.stdout.strip() if r.returncode == 0 else None


class Run:
    def __init__(self, args):
        self.module = os.path.abspath(args.module_dir)
        if not os.path.isdir(self.module):
            fail(f"not a directory: {self.module}")
        self.ddev_root = find_up(
            self.module, lambda d: os.path.isfile(os.path.join(d, ".ddev", "config.yaml"))
        )
        if not self.ddev_root:
            fail("no .ddev/config.yaml above the module; these jobs run inside DDEV")
        self.webroot = find_up(
            self.module, lambda d: os.path.isfile(os.path.join(d, "core", "package.json"))
        )
        if not self.webroot or not self.webroot.startswith(self.ddev_root):
            fail("no Drupal webroot (core/package.json) between the module and the DDEV root")
        self.core = os.path.join(self.webroot, "core")
        self.dry_run = args.dry_run
        self.created = []
        self.vars = dict(DEFAULTS)
        self.vars.update(read_ci_variables(self.module))
        self.jobs = [j for j in JOBS if j in args.only]
        self.include_skipped = args.include_skipped
        self.files = None if args.all else self.changed_files(args.base)

    def changed_files(self, base):
        """Files that differ from the base, committed or not, plus untracked."""
        if git(self.module, "rev-parse", "--git-dir") is None:
            fail("module is not a git checkout; pass --all to check everything")
        candidates = [base] if base else ["@{upstream}", "origin/HEAD"]
        for ref in candidates:
            merge_base = git(self.module, "merge-base", "HEAD", ref)
            if merge_base:
                break
        else:
            fail(f"can't find a merge base with {' or '.join(candidates)}; pass --base <ref> or --all")
        changed = (git(self.module, "diff", "--name-only", "--relative", "--diff-filter=d", merge_base) or "").splitlines()
        untracked = (git(self.module, "ls-files", "--others", "--exclude-standard") or "").splitlines()
        files = [f for f in unique(changed + untracked) if f and os.path.isfile(os.path.join(self.module, f))]
        print(f"Checking {len(files)} changed file(s) against {ref} ({merge_base[:9]}). --all checks everything.")
        return files

    def container(self, host_path):
        rel = os.path.relpath(host_path, self.ddev_root)
        return CONTAINER_ROOT if rel == "." else f"{CONTAINER_ROOT}/{rel}"

    def bin(self, name):
        return f"{self.container(self.core)}/node_modules/.bin/{name}"

    def exec(self, command):
        argv = ["ddev", "exec", "-d", self.container(self.module), "bash", "-c", command]
        print(f"$ (in {self.container(self.module)}) {command}", flush=True)
        if self.dry_run:
            return 0
        # With Mutagen, files just written on the host (our temp config, the
        # human's latest edits) reach the container only after a sync. Without
        # Mutagen this is a no-op or a harmless error.
        subprocess.run(["ddev", "mutagen", "sync"], cwd=self.ddev_root,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return subprocess.run(argv, cwd=self.ddev_root).returncode

    # Temp files: only ever created when absent, always removed afterwards.
    def link(self, target, link_path):
        if os.path.lexists(link_path):
            return
        print(f"+ link {link_path} -> {target}")
        if not self.dry_run:
            os.symlink(os.path.relpath(target, os.path.dirname(link_path)), link_path)
            self.created.append(link_path)

    def write(self, path, content):
        if os.path.lexists(path):
            if path.endswith(CSPELL_CONFIG):
                # Ours from an earlier run that was killed outright; never reuse a stale one.
                raise RuntimeError(f"{path} already exists; remove it first")
            return
        print(f"+ write {path}")
        if not self.dry_run:
            with open(path, "w", encoding="utf-8") as f:
                f.write(content)
            self.created.append(path)

    def cleanup(self):
        for path in reversed(self.created):
            try:
                os.remove(path)
            except FileNotFoundError:
                pass
            except OSError as e:
                print(f"WARNING: could not remove {path}: {e}", file=sys.stderr)

    def skip_reason(self, job):
        if self.vars.get(f"SKIP_{job.upper()}", "0").strip() == "1" and not self.include_skipped:
            return f"SKIP_{job.upper()}=1 in .gitlab-ci.yml"
        return None

    def targets(self, keep):
        """Changed files a job takes, as shell args; None means the whole module."""
        if self.files is None:
            return None
        return [shlex.quote(f) for f in self.files if keep(f)]

    # --- jobs ---------------------------------------------------------------

    def cspell(self):
        files = self.targets(lambda f: True)
        if files == []:
            return "no changed files"
        cfg = build_cspell_config(self.module, os.path.relpath(self.webroot, self.module),
                                  os.path.basename(self.module), self.vars)
        self.write(os.path.join(self.module, CSPELL_CONFIG), json.dumps(cfg, indent=2))
        return self.exec(
            f"{self.bin('cspell')} -c {CSPELL_CONFIG} --show-suggestions --show-context --no-progress "
            f"--no-must-find-files {self.vars['_CSPELL_EXTRA']} {' '.join(files) if files else '.'}"
        )

    def eslint(self):
        files = self.targets(lambda f: f.endswith((".js", ".yml")))
        if files == []:
            return "no changed .js/.yml files"
        parent = os.path.dirname(self.module)
        self.link(os.path.join(self.core, ".eslintrc.passing.json"), os.path.join(parent, ".eslintrc.json"))
        self.link(os.path.join(self.core, ".eslintrc.jquery.json"), os.path.join(parent, ".eslintrc.jquery.json"))
        self.link(os.path.join(self.core, ".prettierrc.json"), os.path.join(self.module, ".prettierrc.json"))
        self.write(os.path.join(self.module, ".prettierignore"), "*.yml\n")
        return self.exec(
            f"{self.bin('eslint')} --no-error-on-unmatched-pattern --ignore-pattern=\"*.es6.js\" "
            f"--resolve-plugins-relative-to={self.container(self.core)} --ext=.js,.yml "
            f"{self.vars['_ESLINT_EXTRA']} {' '.join(files) if files else '.'}"
        )

    def stylelint(self):
        # CI's unquoted ./**/*.css without globstar: exactly one folder deep.
        depth_one = lambda f: f.endswith(".css") and f.count("/") == 1
        files = self.targets(depth_one)
        if self.files is not None:
            deeper = [f for f in self.files if f.endswith(".css") and not depth_one(f)]
            if deeper:
                print(f"stylelint: CI's ./**/*.css glob doesn't reach {', '.join(deeper)}; not linted there either")
        if files == []:
            return "no changed .css files CI would lint"
        names = os.listdir(self.module)
        has_config = any(n.startswith(".stylelintrc") or n.startswith("stylelint.config.") for n in names)
        config = "" if has_config else f"--config {self.container(self.core)}/.stylelintrc.json"
        if not any(n.startswith(".prettierrc") or n.startswith("prettier.config.") for n in names):
            self.link(os.path.join(self.core, ".prettierrc.json"), os.path.join(self.module, ".prettierrc.json"))
        target = f"--allow-empty-input {' '.join(files)}" if files else "./**/*.css"
        return self.exec(
            f"{self.bin('stylelint')} --ignore-path ./.stylelintignore {config} {target} "
            f"--formatter verbose {self.vars['_STYLELINT_EXTRA']}"
        )

    def main(self):
        if not os.path.isdir(os.path.join(self.core, "node_modules")) and not self.dry_run:
            print("Core's node_modules are missing; CI installs them with yarn before these jobs.")
            print("Install them once (needs approval; adds <webroot>/core/node_modules, no tracked files change).")
            print("They survive ddev stop/start; a Composer update that replaces core removes them.")
            print(f"  cd {self.ddev_root} && ddev exec -d {self.container(self.core)} bash -c 'corepack enable && yarn install'")
            return 3
        results = {}
        try:
            for job in self.jobs:
                reason = self.skip_reason(job)
                if reason:
                    results[job] = f"SKIP ({reason})"
                    continue
                print(f"\n=== {job} ===", flush=True)
                rc = getattr(self, job)()
                if isinstance(rc, str):
                    results[job] = f"SKIP ({rc})"
                elif self.dry_run:
                    results[job] = "DRY RUN (not executed)"
                else:
                    results[job] = "PASS" if rc == 0 else f"FAIL (exit {rc})"
        except (RuntimeError, OSError, ValueError) as e:
            print(f"ERROR: {e}", file=sys.stderr)
            return 2
        except KeyboardInterrupt:
            print("\nInterrupted.", file=sys.stderr)
            return 2
        finally:
            self.cleanup()
        print("\n=== summary ===")
        for job in self.jobs:
            print(f"{job}: {results.get(job, 'not run')}")
        return 1 if any(v.startswith("FAIL") for v in results.values()) else 0


def main():
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("module_dir")
    p.add_argument("--base", help="ref to diff against, normally the MR's target branch (e.g. origin/1.x)")
    p.add_argument("--all", action="store_true", help="check the whole module, the way CI does")
    p.add_argument("--only", default=",".join(JOBS),
                   type=lambda s: [x.strip() for x in s.split(",") if x.strip()])
    p.add_argument("--include-skipped", action="store_true",
                   help="also run jobs the module's .gitlab-ci.yml skips")
    p.add_argument("--dry-run", action="store_true",
                   help="print the commands and temp files, change nothing")
    args = p.parse_args()
    bad = [j for j in args.only if j not in JOBS]
    if bad:
        fail(f"unknown job(s): {', '.join(bad)}")
    sys.exit(Run(args).main())


if __name__ == "__main__":
    main()
