#!/usr/bin/env python3
"""
Map what a Drupal module change touches and what depends on it.

Drupal wires code through YAML, attributes/annotations and string IDs, so
import graphs miss most of it. This scanner reads a git diff, extracts the
Drupal "pieces" it touches (services, public PHP API, hooks, plugins, routes,
permissions, config schema, events) and greps the module plus any --scan
roots for their consumers and covering tests. Deterministic: no network, no
LLM, standard library only, and every finding carries file:line.

Usage:
    python3 drupal_impact.py [MODULE_DIR] [--base REF] [--head REF]
        [--symbols A,B,...] [--scan PATH ...] [--format md|json|mermaid|all]
        [--out DIR] [--max-nodes N] [--fail-on high|medium]

--base defaults to the merge-base of HEAD with origin's default branch
(falling back to HEAD, i.e. uncommitted changes only). --head defaults to
the working tree, untracked files included. Exit status is 0 unless
--fail-on is given and the overall risk reaches it.

Detection rules and known blind spots: references/detection-rules.md.
"""

import argparse
import bisect
import fnmatch
import json
import os
import re
import subprocess
import sys

SCHEMA = 1
RISKS = ["NONE", "LOW", "MEDIUM", "HIGH"]
PHP_EXT = (".php", ".module", ".inc", ".install", ".theme", ".profile", ".engine")
SCAN_EXT = PHP_EXT + (".yml", ".twig")
SKIP_DIRS = {".git", "vendor", "node_modules", ".ddev"}
SUITES = ("FunctionalJavascript", "Functional", "Kernel", "Unit")
# Changes that break a consumer still using the old shape.
BREAKING = {"removed", "renamed", "signature changed", "id changed", "value changed", "planned"}
MD_CONSUMER_CAP = 15

NOT_DETECTED = [
    "Dynamically built service, hook, route, permission or plugin IDs "
    "(string concatenation, variables, sprintf).",
    "JavaScript consumers, and Twig consumers other than path()/url() and quoted IDs.",
    "Runtime-only wiring: hook_*_alter implementations that rewrite definitions, "
    "service decorators and compiler passes, event-name constants resolved through "
    "variables.",
    "Behaviour changes inside a method body whose signature is unchanged "
    "(only services and plugins report body changes).",
    "Sites' own custom code and any module outside the scanned roots.",
    "Tests that exercise a piece without naming it (e.g. through the UI or a route path).",
]


# --------------------------------------------------------------------------
# git
# --------------------------------------------------------------------------

def git(cwd, *args, check=True):
    r = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True)
    if check and r.returncode != 0:
        raise SystemExit(f"git {' '.join(args)} failed: {r.stderr.strip()}")
    return r.stdout if r.returncode == 0 else None


def default_base(cwd):
    """Merge-base of HEAD with origin's default branch, or None."""
    candidates = []
    head = git(cwd, "symbolic-ref", "--quiet", "refs/remotes/origin/HEAD", check=False)
    if head:
        candidates.append(head.strip())
    candidates += ["refs/remotes/origin/main", "refs/remotes/origin/master"]
    for ref in candidates:
        mb = git(cwd, "merge-base", "HEAD", ref, check=False)
        if mb:
            return ref.replace("refs/remotes/", ""), mb.strip()
    return None


def short(cwd, ref):
    out = git(cwd, "rev-parse", "--short", ref, check=False)
    return out.strip() if out else ref


class Tree:
    """Reads module files from the working tree or from a git ref."""

    def __init__(self, cwd, ref=None):
        self.cwd, self.ref = cwd, ref

    def read(self, rel):
        if self.ref is None:
            try:
                with open(os.path.join(self.cwd, rel), encoding="utf-8", errors="replace") as f:
                    return f.read()
            except OSError:
                return None
        return git(self.cwd, "show", f"{self.ref}:./{rel}", check=False)

    def files(self):
        if self.ref is None:
            out = git(self.cwd, "ls-files", "--cached", "--others", "--exclude-standard")
            return [f for f in out.splitlines() if os.path.isfile(os.path.join(self.cwd, f))]
        return git(self.cwd, "ls-tree", "-r", "--name-only", "--full-tree", self.ref, "--", ".").splitlines()


HUNK = re.compile(r"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@")


def collect_diff(cwd, base, head):
    """Return {new_path: {"old": old_path|None, "new": new_path|None,
    "old_lines": set, "new_lines": set, "added": [(n, text)]}}."""
    args = ["diff", "-U0", "--no-color", "--no-ext-diff", "-M", "--relative", base]
    if head:
        args.append(head)
    out = git(cwd, *args, "--", ".")
    files, cur, new_no = {}, None, 0
    for line in out.splitlines():
        if line.startswith("diff --git "):
            cur = {"old": None, "new": None, "old_lines": set(), "new_lines": set(), "added": []}
        elif cur is not None and line.startswith("--- "):
            cur["old"] = None if line[4:] == "/dev/null" else line[6:]
        elif cur is not None and line.startswith("+++ "):
            cur["new"] = None if line[4:] == "/dev/null" else line[6:]
            files[cur["new"] or cur["old"]] = cur
        elif cur is not None and line.startswith("@@"):
            m = HUNK.match(line)
            a, b = int(m.group(1)), int(m.group(2) or 1)
            c, d = int(m.group(3)), int(m.group(4) or 1)
            cur["old_lines"].update(range(a, a + b))
            cur["new_lines"].update(range(c, c + d))
            new_no = c
        elif cur is not None and line.startswith("+") and not line.startswith("+++"):
            cur["added"].append((new_no, line[1:]))
            new_no += 1
    if head is None:
        untracked = git(cwd, "ls-files", "--others", "--exclude-standard").splitlines()
        for rel in untracked:
            try:
                with open(os.path.join(cwd, rel), encoding="utf-8", errors="replace") as f:
                    lines = f.read().splitlines()
            except OSError:
                continue
            files[rel] = {"old": None, "new": rel, "old_lines": set(),
                          "new_lines": set(range(1, len(lines) + 1)),
                          "added": list(enumerate(lines, 1))}
    return files


# --------------------------------------------------------------------------
# PHP structure
# --------------------------------------------------------------------------

def blank_php(text):
    """Blank out comments and string contents (keeping newlines and quotes)
    so braces and keywords can be matched structurally."""
    out, i, n = [], 0, len(text)
    while i < n:
        ch = text[i]
        if ch == "/" and text.startswith("/*", i):
            j = text.find("*/", i + 2)
            j = n if j < 0 else j + 2
            out.append(re.sub(r"[^\n]", " ", text[i:j]))
            i = j
        elif (ch == "#" and not text.startswith("#[", i)) or text.startswith("//", i):
            j = text.find("\n", i)
            j = n if j < 0 else j
            out.append(" " * (j - i))
            i = j
        elif ch in "'\"":
            j = i + 1
            while j < n and text[j] != ch:
                j += 2 if text[j] == "\\" else 1
            j = min(j, n - 1)
            out.append(ch + re.sub(r"[^\n]", " ", text[i + 1:j]) + ch)
            i = j + 1
        else:
            out.append(ch)
            i += 1
    return "".join(out)


class Php:
    CLASS = re.compile(r"^\s*(?:(?:abstract|final|readonly)\s+)*(class|interface|trait|enum)\s+(\w+)")
    METHOD = re.compile(r"^\s*((?:(?:public|protected|private|static|abstract|final)\s+)*)function\s+&?\s*(\w+)\s*\(")
    FUNC = re.compile(r"^function\s+&?\s*(\w+)\s*\(")

    def __init__(self, text):
        self.text = text
        self.lines = text.split("\n")
        self.blank = blank_php(text)
        self.blines = self.blank.split("\n")
        starts, pos = [], 0
        for line in self.blines:
            starts.append(pos)
            pos += len(line) + 1
        self.starts = starts
        self.match = {}
        stack = []
        for idx, ch in enumerate(self.blank):
            if ch == "{":
                stack.append(idx)
            elif ch == "}" and stack:
                self.match[stack.pop()] = idx
        m = re.search(r"^\s*namespace\s+([\w\\]+)\s*;", self.blank, re.M)
        self.namespace = m.group(1) if m else ""
        self.uses = {}
        for m in re.finditer(r"^\s*use\s+([\w\\]+)(?:\s+as\s+(\w+))?\s*;", self.blank, re.M):
            self.uses[m.group(2) or m.group(1).rsplit("\\", 1)[-1]] = m.group(1)

    def line_of(self, offset):
        return bisect.bisect_right(self.starts, offset)

    def block_end(self, line_no):
        """Line where the declaration starting on line_no ends: its matching
        '}' or, for bodiless declarations, the first ';'."""
        off = self.starts[line_no - 1]
        brace = self.blank.find("{", off)
        semi = self.blank.find(";", off)
        if brace < 0 or (0 <= semi < brace):
            return self.line_of(semi if semi >= 0 else len(self.blank) - 1), self.line_of(semi if semi >= 0 else off)
        return self.line_of(self.match.get(brace, len(self.blank) - 1)), self.line_of(brace)

    def leading(self, line_no):
        """First line of the docblock/attribute region above line_no."""
        i = line_no - 2
        while i >= 0:
            s = self.blines[i].strip()
            if s.endswith((";", "{", "}")) or s.startswith("<?php"):
                break
            i -= 1
        return i + 2

    def signature(self, line_no, sig_end):
        return re.sub(r"\s+", " ", " ".join(self.lines[line_no - 1:sig_end])).split("{")[0].strip()

    def fqcn(self, name):
        return f"{self.namespace}\\{name}" if self.namespace else name

    def resolve(self, name):
        name = name.strip().lstrip("\\")
        if name in self.uses:
            return self.uses[name]
        return name if "\\" in name else self.fqcn(name)

    def classes(self):
        for i, bl in enumerate(self.blines, 1):
            m = self.CLASS.match(bl)
            if not m:
                continue
            end, body = self.block_end(i)
            decl = " ".join(self.blines[i - 1:body])
            parents = []
            for kw in ("extends", "implements"):
                mm = re.search(kw + r"\s+([\w\\,\s]+?)(?:\bimplements\b|\{|$)", decl)
                if mm:
                    parents += [self.resolve(p) for p in mm.group(1).split(",") if p.strip()]
            yield {"type": m.group(1), "name": m.group(2), "line": i, "end": end, "decl_end": body,
                   "abstract": bool(re.match(r"^\s*(?:final\s+|readonly\s+)*abstract\b", bl)),
                   "parents": parents}

    def methods(self, cls):
        for i in range(cls["line"] + 1, cls["end"]):
            m = self.METHOD.match(self.blines[i - 1])
            if not m:
                continue
            end, sig_end = self.block_end(i)
            mods = m.group(1).split()
            vis = next((v for v in ("public", "protected", "private") if v in mods), "public")
            yield {"name": m.group(2), "line": i, "end": end, "sig_end": sig_end,
                   "visibility": vis, "lead": self.leading(i)}

    def functions(self):
        for i, bl in enumerate(self.blines, 1):
            m = self.FUNC.match(bl)
            if m:
                end, sig_end = self.block_end(i)
                yield {"name": m.group(1), "line": i, "end": end, "sig_end": sig_end}

    def lead_text(self, line_no):
        return "\n".join(self.lines[self.leading(line_no) - 1:line_no - 1])


def touched(lines, start, end, only=None):
    return any(start <= n <= end and (only is None or n in only) for n in lines)


# --------------------------------------------------------------------------
# Minimal YAML (line based: keys, nesting by indent, scalar values)
# --------------------------------------------------------------------------

YKEY = re.compile(r"""^(\s*)(?:'([^']*)'|"([^"]*)"|([^\s#'"][^:#]*?))\s*:(?:\s+(.*?))?\s*$""")


def yaml_entries(text):
    """List of {"path": tuple, "line", "end", "value"} for every mapping key."""
    lines = text.split("\n")
    entries, stack, block_indent = [], [], None
    for no, raw in enumerate(lines, 1):
        stripped = raw.strip()
        if not stripped or stripped.startswith("#"):
            continue
        indent = len(raw) - len(raw.lstrip())
        if block_indent is not None:
            if indent > block_indent:
                continue
            block_indent = None
        if stripped.startswith("- "):
            continue
        m = YKEY.match(raw)
        if not m:
            continue
        key = m.group(2) if m.group(2) is not None else m.group(3) if m.group(3) is not None else m.group(4)
        value = m.group(5)
        while stack and stack[-1][0] >= indent:
            stack.pop()
        path = tuple(k for _, k in stack) + (key,)
        stack.append((indent, key))
        if value and value.split("#")[0].strip() in ("|", ">", "|-", ">-", "|+", ">+"):
            block_indent = indent
        entries.append({"path": path, "line": no, "indent": indent,
                        "value": unquote(value.split(" #")[0]) if value else None})
    for idx, e in enumerate(entries):
        end = len(lines)
        for nxt in entries[idx + 1:]:
            if nxt["indent"] <= e["indent"]:
                end = nxt["line"] - 1
                break
        while end > e["line"] and not lines[end - 1].strip():
            end -= 1
        e["end"] = end
    return entries


def unquote(v):
    v = v.strip()
    if len(v) >= 2 and v[0] == v[-1] and v[0] in "'\"":
        return v[1:-1]
    return v


def block_text(text, start, end):
    return "\n".join(l.rstrip() for l in text.split("\n")[start - 1:end]
                     if l.strip() and not l.strip().startswith("#"))


# --------------------------------------------------------------------------
# Piece extraction
# --------------------------------------------------------------------------

def piece(kind, pid, rel, line, end, **extra):
    p = {"kind": kind, "id": pid, "file": rel, "line": line, "end": end}
    p.update(extra)
    return p


def module_name(module_dir):
    for f in sorted(os.listdir(module_dir)):
        if f.endswith(".info.yml"):
            return f[:-len(".info.yml")]
    return os.path.basename(os.path.abspath(module_dir))


def extract(rel, text, machine):
    """All Drupal pieces defined in one file version. Each carries the line
    span that counts as 'touching' it, plus a comparable 'sig'/'body'."""
    if text is None:
        return []
    base = os.path.basename(rel)
    out = []
    if base.endswith(".services.yml"):
        for e in yaml_entries(text):
            if len(e["path"]) == 2 and e["path"][0] == "services" and e["path"][1] != "_defaults":
                sid = e["path"][1]
                cls = next((x["value"] for x in yaml_entries(text)
                            if x["path"] == ("services", sid, "class")), None)
                # A bare FQCN id is its own class; '@other' is an alias, no class.
                if cls is None and "\\" in sid and not (e["value"] or "").startswith("@"):
                    cls = sid
                out.append(piece("service", sid, rel, e["line"], e["end"],
                                 body=block_text(text, e["line"], e["end"]),
                                 sig=block_text(text, e["line"], e["end"]),
                                 cls=(cls or "").lstrip("\\") or None, alias=e["value"]))
    elif base.endswith(".routing.yml"):
        entries = yaml_entries(text)
        for e in entries:
            if len(e["path"]) == 1 and e["path"][0] != "route_callbacks":
                path = next((x["value"] for x in entries if x["path"] == (e["path"][0], "path")), None)
                out.append(piece("route", e["path"][0], rel, e["line"], e["end"],
                                 body=block_text(text, e["line"] + 1, e["end"]), sig=path, pair=path))
    elif base.endswith(".permissions.yml"):
        for e in yaml_entries(text):
            if len(e["path"]) == 1:
                kind = "permission-callbacks" if e["path"][0] == "permission_callbacks" else "permission"
                body = block_text(text, e["line"] + 1, e["end"])
                out.append(piece(kind, e["path"][0], rel, e["line"], e["end"], body=body, sig=None, pair=body))
    elif "/config/schema/" in "/" + rel and base.endswith(".yml"):
        entries = yaml_entries(text)
        for e in entries:
            if len(e["path"]) == 1:
                keys = sorted("/".join(x["path"][1:]) for x in entries
                              if x["path"][0] == e["path"][0] and len(x["path"]) > 1)
                out.append(piece("config-schema", e["path"][0], rel, e["line"], e["end"],
                                 body=block_text(text, e["line"], e["end"]), sig=None, keys=keys))
    elif base.endswith(PHP_EXT):
        out += extract_php(rel, text, machine)
    return out


def extract_php(rel, text, machine):
    php = Php(text)
    out = []
    base = os.path.basename(rel)
    for cls in php.classes():
        fq = php.fqcn(cls["name"])
        api = cls["type"] in ("interface", "trait") or cls["abstract"]
        extra = {"class_type": "abstract class" if cls["abstract"] else cls["type"], "short": cls["name"]}
        decl = php.signature(cls["line"], cls["decl_end"])
        # Whole class: added/removed/declaration changes only for concrete
        # classes; for API classes also members outside any method (constants,
        # properties), since each method is its own piece.
        methods = list(php.methods(cls))
        in_methods = {n for m in methods for n in range(m["lead"], m["end"] + 1)}
        members = None if not api else set(range(cls["line"], cls["end"] + 1)) - in_methods
        out.append(piece("php-api", fq, rel, cls["line"], cls["end"] if api else cls["decl_end"],
                         sig=decl, body=decl if not api else None, api=api,
                         only=members, parents=cls["parents"], class_end=cls["end"], **extra))
        lead = php.lead_text(cls["line"])
        pm = re.search(r"#\[(\w+)\((.*?)\)\]\s*$", lead, re.S) or re.search(r"@(\w+)\((.*)\)", lead, re.S)
        if pm and pm.group(1) not in ("Hook", "Attribute", "AsEventListener"):
            idm = re.search(r"""\bid\s*[:=]\s*['"]([^'"]+)['"]""", pm.group(2))
            if idm:
                start = php.leading(cls["line"])
                out.append(piece("plugin", idm.group(1), rel, start, cls["end"],
                                 sig=None, body=text.split("\n")[start - 1:cls["end"]],
                                 plugin_type=pm.group(1), cls=fq, pair=fq))
        for m in methods:
            if m["visibility"] == "private":
                continue
            if api or m["visibility"] == "public":
                sig = php.signature(m["line"], m["sig_end"])
                span_end = m["end"] if api else m["sig_end"]
                out.append(piece("php-api", f"{fq}::{m['name']}", rel, m["line"], span_end,
                                 sig=sig, api=api, method=m["name"], short=cls["name"], owner=fq,
                                 class_type=extra["class_type"], visibility=m["visibility"]))
            hm = re.search(r"""#\[Hook\(\s*(?:hook:\s*)?['"]([^'"]+)['"]""", php.lead_text(m["line"]))
            if hm:
                out.append(piece("hook", hm.group(1), rel, m["lead"], m["end"],
                                 sig=None, body="\n".join(php.lines[m["lead"] - 1:m["end"]]),
                                 impl=f"{fq}::{m['name']}"))
            if m["name"] == "getSubscribedEvents":
                body = "\n".join(php.lines[m["line"] - 1:m["end"]])
                for ev in sorted(set(event_tokens(body, php))):
                    out.append(piece("event", ev, rel, m["line"], m["end"], sig=None,
                                     body=event_line(body, ev), subscriber=fq))
        if cls["name"].endswith("Events"):
            for i in range(cls["line"], cls["end"] + 1):
                cm = re.match(r"""^\s*(?:(?:public|protected|private|final)\s+)*const\s+(\w+)\s*=\s*['"]([^'"]+)['"]""",
                              php.lines[i - 1])
                if cm:
                    out.append(piece("event", f"{fq}::{cm.group(1)}", rel, i, i, sig=cm.group(2),
                                     value=cm.group(2), short=f"{cls['name']}::{cm.group(1)}"))
    if base.endswith((".module", ".install", ".inc", ".theme")):
        prefix = machine + "_"
        for f in php.functions():
            name = f["name"]
            # Update functions are update paths, not hook implementations.
            if not name.startswith(prefix) or re.search(r"_update_\d+$|_post_update_", name):
                continue
            out.append(piece("hook", name[len(prefix):], rel, f["line"], f["end"],
                             sig=None, body="\n".join(php.lines[f["line"] - 1:f["end"]]), impl=name))
    return out


def event_tokens(body, php):
    toks = []
    for m in re.finditer(r"\b([A-Z]\w*)::([A-Z][A-Z0-9_]*)\b", body):
        toks.append(f"{php.resolve(m.group(1))}::{m.group(2)}")
    for m in re.finditer(r"\b([A-Z]\w*)::class\s*\]?\s*(?:=>|\]\s*=)", body):
        toks.append(php.resolve(m.group(1)))
    for m in re.finditer(r"""(?:\[\s*|\$events\[)['"]([a-z_]+(?:\.[a-z_]+)+)['"]""", body):
        toks.append(m.group(1))
    return toks


def event_line(body, ev):
    tail = ev.rsplit("\\", 1)[-1]
    return [l.strip() for l in body.split("\n") if tail in l]


# --------------------------------------------------------------------------
# Change classification
# --------------------------------------------------------------------------

def key(p):
    return (p["kind"], p["id"])


def classify(diff, old_tree, new_tree, machine):
    """Return the list of touched pieces and files with unclassified changes."""
    pieces, unclassified, update_hook = [], [], []
    service_classes = {}
    for side in (old_tree, new_tree):
        for rel in side_services(side):
            for p in extract(rel, side.read(rel), machine):
                if p["kind"] == "service" and p.get("cls"):
                    service_classes.setdefault(p["cls"], p)
    for rel, d in sorted(diff.items()):
        old = extract(d["old"], old_tree.read(d["old"]), machine) if d["old"] else []
        new = extract(d["new"], new_tree.read(d["new"]), machine) if d["new"] else []
        for n, line in d["added"]:
            if re.search(r"function\s+\w+_(update_\d+|post_update_\w+)\s*\(", line):
                update_hook.append({"file": d["new"], "line": n, "text": line.strip()})
        olds = {key(p): p for p in old}
        news = {key(p): p for p in new}
        hit_old, hit_new = set(), set()
        found = []
        for k in list(olds) + [k for k in news if k not in olds]:
            o, n = olds.get(k), news.get(k)
            t_old = o and touched(d["old_lines"], o["line"], o["end"], o.get("only"))
            t_new = n and touched(d["new_lines"], n["line"], n["end"], n.get("only"))
            if t_old:
                hit_old.update(range(o["line"], o["end"] + 1))
            if t_new:
                hit_new.update(range(n["line"], n["end"] + 1))
            if o and n:
                if not (t_old or t_new):
                    continue
                if o.get("sig") != n.get("sig") and o.get("sig") is not None:
                    change = "value changed" if n["kind"] == "event" and n.get("value") else \
                        "path changed" if n["kind"] == "route" else "signature changed"
                elif o.get("body") != n.get("body") or n["kind"] in ("config-schema",) and o.get("keys") != n.get("keys"):
                    change = "changed"
                elif n.get("api") and n.get("body") is None and n["id"].count("::") == 0:
                    change = "members changed"
                else:
                    continue
                found.append(dict(n, change=change, side="head", old=o))
            elif n and t_new:
                found.append(dict(n, change="added", side="head"))
            elif o and t_old:
                found.append(dict(o, change="removed", side="base"))
        found = pair_renames(found)
        # An added or removed class already covers its methods.
        whole = {(p["id"], p["change"]) for p in found
                 if p["kind"] == "php-api" and "::" not in p["id"] and p["change"] in ("added", "removed")}
        found = [p for p in found if not (p.get("owner") and (p["owner"], p["change"]) in whole)]
        # Concrete classes registered as services: a body change is a change to the service.
        for p in old + new:
            if p["kind"] == "php-api" and p["id"].count("::") == 0 and p["id"] in service_classes:
                lines = d["new_lines"] if p in new else d["old_lines"]
                cls_end = p["class_end"]
                if touched(lines, p["line"], cls_end):
                    svc = service_classes[p["id"]]
                    if not any(f["kind"] == "service" and f["id"] == svc["id"] for f in found):
                        found.append(dict(svc, change="implementation changed", side="head",
                                          via=f"{p['file']}:{p['line']}"))
                    (hit_new if p in new else hit_old).update(range(p["line"], cls_end + 1))
        pieces += found
        rest_new = sorted(d["new_lines"] - hit_new) if d["new"] else []
        rest_old = sorted(d["old_lines"] - hit_old) if not d["new"] else []
        if (rest_new or rest_old) and not any(p["file"] in (d["new"], d["old"]) for p in found):
            unclassified.append({"file": d["new"] or d["old"], "lines": ranges(rest_new or rest_old),
                                 "side": "head" if rest_new else "base"})
    # A service changed through its class shows once even if two files touched it.
    seen, unique = set(), []
    for p in pieces:
        if key(p) not in seen:
            seen.add(key(p))
            unique.append(p)
    return unique, unclassified, update_hook


def side_services(tree):
    try:
        return [f for f in tree.files() if f.endswith(".services.yml")]
    except SystemExit:
        return []


def pair_renames(found):
    removed = [p for p in found if p["change"] == "removed" and p.get("pair")]
    added = [p for p in found if p["change"] == "added" and p.get("pair")]
    for r in removed:
        a = next((a for a in added if a["kind"] == r["kind"] and a["pair"] == r["pair"]), None)
        if a:
            r["change"], r["renamed_to"] = "renamed", a["id"]
            r["renamed_to_at"] = f"{a['file']}:{a['line']}"
            found.remove(a)
            added.remove(a)
    return found


def ranges(nums):
    out, start, prev = [], None, None
    for n in nums:
        if start is None:
            start = prev = n
        elif n == prev + 1:
            prev = n
        else:
            out.append(f"{start}-{prev}" if prev != start else str(start))
            start = prev = n
    if start is not None:
        out.append(f"{start}-{prev}" if prev != start else str(start))
    return ",".join(out)


# --------------------------------------------------------------------------
# Consumer search
# --------------------------------------------------------------------------

class Corpus:
    """Every scannable file in the module and the --scan roots, read once."""

    def __init__(self, module_dir, module_tree, scan_roots, machine):
        self.files = []
        self.module_abs = os.path.abspath(module_dir)
        self.skipped_copies = []
        self._info = {}
        self._children = None
        for rel in module_tree.files():
            if rel.endswith(SCAN_EXT) and not any(s in SKIP_DIRS for s in rel.split("/")):
                text = module_tree.read(rel)
                if text is not None:
                    self.add(os.path.join(self.module_abs, rel), text, False)
        for root in scan_roots:
            for dirpath, dirnames, filenames in os.walk(os.path.abspath(root)):
                keep = []
                for d in sorted(dirnames):
                    full = os.path.join(dirpath, d)
                    if d in SKIP_DIRS or full == self.module_abs:
                        continue
                    # Another copy of the scanned module isn't a dependent.
                    if os.path.isfile(os.path.join(full, machine + ".info.yml")):
                        self.skipped_copies.append(display(full))
                        continue
                    keep.append(d)
                dirnames[:] = keep
                for f in sorted(filenames):
                    if f.endswith(SCAN_EXT):
                        ab = os.path.join(dirpath, f)
                        try:
                            with open(ab, encoding="utf-8", errors="replace") as fh:
                                self.add(ab, fh.read(), True)
                        except OSError:
                            pass

    def add(self, ab, text, outside):
        self.files.append({"abs": ab, "file": display(ab), "text": text, "lines": text.split("\n"),
                           "outside": outside, "module": self.owner(ab),
                           "test": "/tests/" in ab.replace(os.sep, "/")})

    def descendants(self, fq):
        """Classes extending/implementing fq, transitively: {fqcn: (file, line)}."""
        if self._children is None:
            self._children = {}
            for f in self.files:
                if not f["file"].endswith(PHP_EXT) or not re.search(r"\b(extends|implements)\b", f["text"]):
                    continue
                php = Php(f["text"])
                for c in php.classes():
                    for parent in c["parents"]:
                        self._children.setdefault(parent, []).append((php.fqcn(c["name"]), f, c["line"]))
        found, queue = {}, [fq]
        while queue:
            for child, f, line in self._children.get(queue.pop(), []):
                if child not in found:
                    found[child] = (f, line)
                    queue.append(child)
        return found

    def owner(self, ab):
        d = os.path.dirname(ab)
        while True:
            if d in self._info:
                return self._info[d]
            try:
                info = [f for f in os.listdir(d) if f.endswith(".info.yml")]
            except OSError:
                info = []
            if info:
                self._info[d] = info[0][:-len(".info.yml")]
                return self._info[d]
            parent = os.path.dirname(d)
            if parent == d:
                return "?"
            d = parent


def display(ab):
    rel = os.path.relpath(ab)
    return rel if not rel.startswith("../../../") else ab


def lit(s):
    return re.compile(r"""(['"])""" + re.escape(s) + r"\1")


def yml_value(s):
    return re.compile(r"""(?::|^\s*-)\s*['"]?@?\??""" + re.escape(s) + r"""['"]?\s*(?:#.*)?$""")


def class_refs(fq):
    """Files referencing a class: imported, fully qualified, or same namespace."""
    ns, _, short_name = fq.rpartition("\\")
    word = re.compile(r"\b" + re.escape(short_name) + r"\b")
    fq_re = re.compile(re.escape(fq).replace(r"\\", r"\\\\?") + r"\b")
    ns_re = re.compile(r"^\s*namespace\s+" + re.escape(ns) + r"\s*;", re.M)

    def refers(f):
        if not f["file"].endswith(PHP_EXT) or short_name not in f["text"]:
            return False
        return bool(fq_re.search(f["text"]) or (ns and ns_re.search(f["text"])))
    return refers, word, short_name


def matchers(p):
    """[(file filter or None, line regex, how)] used to find consumers."""
    kind, pid = p["kind"], p["id"]
    m = []
    is_php = lambda f: f["file"].endswith(PHP_EXT) or f["file"].endswith(".twig")
    is_yml = lambda f: f["file"].endswith(".yml")
    if kind == "service":
        m += [(is_php, lit(pid), "service id"), (is_yml, yml_value(pid), "service reference")]
        if p.get("cls"):
            refers, _, short_name = class_refs(p["cls"])
            m.append((refers, re.compile(r"\b" + re.escape(short_name) + r"\s+\$\w+"), "type hint"))
    elif kind == "php-api":
        owner = p.get("owner") or pid
        refers, word, short_name = class_refs(owner)
        if p.get("method"):
            meth = re.escape(p["method"])
            m.append((refers, re.compile(r"\b(implements|extends)\b[^{;]*\b" + re.escape(short_name) + r"\b"), "implements/extends"))
            m.append((refers, re.compile(r"(->|::|\?->)" + meth + r"\s*\("), "call (by name)"))
            m.append((refers, re.compile(r"\bfunction\s+" + meth + r"\s*\("), "override (by name)"))
        else:
            m.append((refers, word, "reference"))
        # Routes (_controller, _form), services (class, parent) and plugin
        # definitions name classes as strings in YAML.
        target = re.escape(owner) + (r"::" + re.escape(p["method"]) + r"\b" if p.get("method") else r"(?![\w\\])")
        m.append((is_yml, re.compile(r"\\?" + target), "YAML class reference"))
    elif kind == "hook":
        h = re.escape(pid)
        m.append((is_php, re.compile(r"""(invokeAll|invokeAllWith|invoke|hasImplementations)\s*\([^)]*['"]""" + h + r"""['"]"""), "hook invocation"))
        if pid.endswith("_alter"):
            m.append((is_php, re.compile(r"""->alter\(\s*(\[[^\]]*)?['"]""" + re.escape(pid[:-6]) + r"""['"]"""), "alter invocation"))
        m.append((lambda f: f["file"].endswith(".api.php"), re.compile(r"\bhook_" + h + r"\s*\("), "documented in api.php"))
        if p.get("impl") and "::" not in p["impl"]:
            m.append((is_php, re.compile(r"(?<![\w>:])" + re.escape(p["impl"]) + r"\s*\("), "direct call"))
    elif kind == "plugin":
        m += [(is_php, lit(pid), "plugin id"), (is_yml, yml_value(pid), "plugin id in YAML")]
        if p.get("cls"):
            refers, word, _ = class_refs(p["cls"])
            m.append((refers, word, "class reference"))
    elif kind == "route":
        m += [(is_php, lit(pid), "route name"),
              (is_yml, re.compile(r"""^\s*(route_name|base_route|parent_id|route)\s*:\s*['"]?""" + re.escape(pid) + r"""['"]?\s*$"""), "route reference")]
    elif kind == "permission":
        m += [(is_php, lit(pid), "permission string"),
              (is_yml, re.compile(r"""_permission\s*:\s*['"]?([^'"]*[+,])?\s*""" + re.escape(pid) + r"""\s*([+,][^'"]*)?['"]?\s*$"""), "route requirement"),
              (is_yml, re.compile(r"""^\s*-\s*['"]?""" + re.escape(pid) + r"""['"]?\s*$"""), "permission list")]
    elif kind == "config-schema":
        if "*" not in pid:
            m.append((is_php, lit(pid), "config name"))
        cfg = re.compile("^" + fnmatch.translate(pid + ".yml")[:-2].replace("(?s:", "(?:") + "$") if pid else None
        m.append((lambda f, cfg=cfg: re.search(r"/config/(install|optional)/", "/" + f["file"].replace(os.sep, "/"))
                  and cfg.match(os.path.basename(f["file"])) is not None,
                  re.compile(r"\S"), "shipped config"))
        old_keys = set((p.get("old") or {}).get("keys") or p.get("keys") or [])
        gone = {k.split("/")[-1] for k in old_keys - set(p.get("keys") or [])} if p.get("old") else set()
        lit_cfg = lit(pid)
        for k in sorted(gone - {"mapping", "type", "label"}):
            m.append((lambda f: bool(lit_cfg.search(f["text"])),
                      re.compile(r"""->(get|set|clear)\(\s*['"]""" + re.escape(k) + r"\b"), f"reads removed key '{k}'"))
    elif kind == "event":
        tokens = [pid] + ([p["short"]] if p.get("short") else []) + ([p["value"]] if p.get("value") else [])
        tail = pid.rsplit("\\", 1)[-1]
        alts = "|".join(re.escape(t) for t in {tail, *tokens})
        m.append((is_php, re.compile(r"dispatch\([^;]*(" + alts + r")"), "dispatch"))
        m.append((lambda f: "getSubscribedEvents" in f["text"], re.compile(r"(" + alts + r")[^;]*=>"), "other subscriber"))
    return m


def find_consumers(p, corpus):
    consumers, tests = [], []
    own = (p["abs"], p["line"], p["end"])
    owner = (p.get("owner") or p.get("cls") or p["id"]).rsplit("\\", 1)[-1]
    declares = re.compile(r"^\s*(?:(?:abstract|final|readonly)\s+)*(?:class|interface|trait|enum)\s+" + re.escape(owner) + r"\b")
    for f in corpus.files:
        for filt, rx, how in matchers(p):
            if filt and not filt(f):
                continue
            for no, line in enumerate(f["lines"], 1):
                if not rx.search(line):
                    continue
                if f["abs"] == own[0] and own[1] <= no <= own[2] and p.get("side") != "base":
                    continue
                if how in ("reference", "class reference") and declares.match(line):
                    continue
                hit = {"abs": f["abs"], "file": f["file"], "line": no, "text": line.strip()[:160], "how": how,
                       "module": f["module"], "outside": f["outside"]}
                if how == "shipped config":
                    hit["text"] = os.path.basename(f["file"])
                (tests if f["test"] else consumers).append(hit)
                if how == "shipped config":
                    break
    if p["kind"] == "php-api" or p.get("cls"):
        refers, _, _ = class_refs(p.get("owner") or p.get("cls") or p["id"])
        for f in corpus.files:
            if f["test"] and refers(f) and not any(t["file"] == f["file"] for t in tests):
                no = next((i for i, l in enumerate(f["lines"], 1)
                           if re.search(r"\b" + re.escape((p.get("owner") or p.get("cls") or p["id"]).rsplit("\\", 1)[-1]) + r"\b", l)), 1)
                tests.append({"abs": f["abs"], "file": f["file"], "line": no, "text": f["lines"][no - 1].strip()[:160],
                              "how": "test references class", "module": f["module"], "outside": f["outside"]})
    dedupe = lambda xs: list({(x["file"], x["line"]): x for x in xs}.values())
    consumers = dedupe(consumers)
    # An override inside the defining file is the definition itself.
    consumers = [c for c in consumers if not (c["abs"] == own[0] and c["how"] == "override (by name)")]
    tests = dedupe(tests)
    if p["kind"] == "php-api" and p.get("api"):
        # Implementers reached through a base class never name the API class.
        meth = re.compile(r"\bfunction\s+" + re.escape(p["method"]) + r"\s*\(") if p.get("method") else None
        for child, (f, line) in corpus.descendants(p.get("owner") or p["id"]).items():
            hits = [(line, "inherits")]
            if meth:
                hits += [(no, "override (inherited)") for no, l in enumerate(f["lines"], 1) if meth.search(l)]
            for no, how in hits:
                if not any(x["abs"] == f["abs"] and x["line"] == no for x in consumers + tests):
                    (tests if f["test"] else consumers).append(
                        {"abs": f["abs"], "file": f["file"], "line": no, "text": f["lines"][no - 1].strip()[:160],
                         "how": how, "module": f["module"], "outside": f["outside"]})
    for x in consumers + tests:
        x.pop("abs")
    for t in tests:
        t["suite"] = suite_of(t["file"])
    return consumers, tests


def suite_of(path):
    parts = path.replace(os.sep, "/").split("/")
    for s in SUITES:
        if s in parts:
            return s
    return "Other"


# --------------------------------------------------------------------------
# Risk
# --------------------------------------------------------------------------

def score(p, update_hooks):
    reasons, risk = [], "LOW"
    out = sum(1 for c in p["consumers"] if c["outside"])
    inside = len(p["consumers"]) - out
    breaking = p["change"] in BREAKING and p["kind"] in ("php-api", "service", "plugin", "route", "permission", "event")
    if p["kind"] == "php-api" and p["change"] == "signature changed" and not p.get("method"):
        reasons.append("class declaration (extends/implements) changed")
    if breaking and out:
        risk = "HIGH"
        reasons.append(f"{p['change']} with {out} consumer(s) outside the module")
    elif breaking and inside:
        risk = "MEDIUM"
        reasons.append(f"{p['change']} with {inside} consumer(s) inside the module only")
    elif breaking and p["kind"] in ("php-api",) and p.get("api"):
        risk = "MEDIUM"
        reasons.append(f"{p['change']} on a {p.get('class_type')} that other modules may extend; no consumer found")
    if p["kind"] == "permission" and p["change"] in ("removed", "renamed"):
        risk = "HIGH"
        reasons.append(f"permission {p['change']}: existing role config still grants the old name")
    if p["kind"] == "config-schema" and p["change"] != "planned":
        if update_hooks:
            reasons.append("update hook in diff: " + ", ".join(f"{u['file']}:{u['line']}" for u in update_hooks))
        else:
            risk = "HIGH"
            reasons.append("config schema changed with no update hook (hook_update_N / hook_post_update_NAME) in the diff")
    if p["kind"] == "permission-callbacks":
        reasons.append("permission_callbacks changed: permissions are built at runtime, not checked")
    if not p["tests"]:
        if RISKS.index(risk) < RISKS.index("MEDIUM"):
            risk = "MEDIUM"
        reasons.append("no covering test references it")
    if not reasons:
        reasons.append(f"{p['change']}; {len(p['tests'])} covering test(s)")
    return risk, reasons


# --------------------------------------------------------------------------
# Symbols mode
# --------------------------------------------------------------------------

def resolve_symbols(symbols, tree, machine):
    every = []
    for rel in tree.files():
        if rel.endswith(SCAN_EXT) and not rel.startswith("tests/") and "/tests/" not in rel:
            every += extract(rel, tree.read(rel), machine)
    found, missing = [], []
    for sym in symbols:
        s = sym.strip().lstrip("\\")
        hits = [p for p in every if p["id"] == s or p["id"].endswith("\\" + s)
                or (p.get("impl") == s) or (p["kind"] == "hook" and s in (f"hook_{p['id']}",))]
        if not hits:
            missing.append(sym)
        for p in hits:
            if key(p) not in {key(f) for f in found}:
                found.append(dict(p, change="planned", side="head"))
    return found, missing


# --------------------------------------------------------------------------
# Rendering
# --------------------------------------------------------------------------

LABEL = {"php-api": "PHP API", "service": "Service", "hook": "Hook", "plugin": "Plugin", "route": "Route",
         "permission": "Permission", "permission-callbacks": "Permission callbacks",
         "config-schema": "Config schema", "event": "Event"}


def build_report(args, module, pieces, unclassified, update_hooks, base_label, head_label, missing):
    order = sorted(pieces, key=lambda p: (-RISKS.index(p["risk"]), p["kind"], p["id"]))
    tests = {}
    for p in order:
        for t in p["tests"]:
            entry = tests.setdefault(t["file"], {"file": t["file"], "suite": t["suite"], "pieces": []})
            if p["id"] not in entry["pieces"]:
                entry["pieces"].append(p["id"])
    clean = []
    for p in order:
        c = {k: p[k] for k in ("kind", "id", "change", "file", "line", "side", "risk", "reasons", "consumers", "tests")}
        for extra in ("renamed_to", "renamed_to_at", "via", "plugin_type", "class_type", "impl", "keys"):
            if p.get(extra):
                c[extra] = p[extra]
        if p.get("old") and p["old"].get("sig") != p.get("sig") and p.get("sig") is not None:
            c["before"], c["after"] = p["old"]["sig"], p["sig"]
        clean.append(c)
    consumers = sum(len(p["consumers"]) for p in clean)
    outside = sum(1 for p in clean for c in p["consumers"] if c["outside"])
    notes = []
    if missing:
        notes.append("Symbols not found in the module: " + ", ".join(missing))
    return {
        "schema": SCHEMA, "module": module, "module_dir": display(os.path.abspath(args.module_dir)),
        "mode": "symbols" if args.symbols else "diff",
        "base": base_label, "head": head_label,
        "risk": max((p["risk"] for p in clean), key=RISKS.index, default="NONE"),
        "scan_roots": [display(os.path.abspath(r)) for r in args.scan],
        "scan_skipped": not args.scan,
        "summary": {"pieces": len(clean), "consumers": consumers, "consumers_outside": outside,
                    "tests": len(tests)},
        "pieces": clean,
        "tests_to_run": sorted(tests.values(), key=lambda t: (SUITES[::-1].index(t["suite"]) if t["suite"] in SUITES else 9, t["file"])),
        "update_hooks_in_diff": update_hooks,
        "unclassified_changes": unclassified,
        "notes": notes,
        "not_detected": NOT_DETECTED + ([] if args.scan else
                                        ["Dependents in other modules were NOT checked (no --scan roots given)."]),
    }


def md_escape(s):
    return str(s).replace("|", "\\|").replace("\n", " ")


def render_md(r, mermaid):
    s = r["summary"]
    out = [f"# Impact report: {r['module']} ({r['base']}..{r['head']})", "",
           f"**Risk: {r['risk']}** · {s['pieces']} pieces touched · {s['consumers']} consumers "
           f"({s['consumers_outside']} outside module) · {s['tests']} covering tests", ""]
    if r["scan_skipped"]:
        out += ["> Dependents in other modules were NOT checked. Re-run with `--scan <webroot>/modules/contrib`.", ""]
    else:
        out += ["Scanned for dependents: " + ", ".join(f"`{x}`" for x in r["scan_roots"]), ""]
    for n in r["notes"]:
        out += [f"> {n}", ""]
    out += ["## Touched pieces", ""]
    if r["pieces"]:
        out += ["| Kind | Piece | Change | Consumers (in / out) | Tests | Risk | Why |", "|---|---|---|---|---|---|---|"]
        for p in r["pieces"]:
            o = sum(1 for c in p["consumers"] if c["outside"])
            change = p["change"] + (f" → `{p['renamed_to']}`" if p.get("renamed_to") else "")
            out.append(f"| {LABEL[p['kind']]} | `{md_escape(p['id'])}`<br>{p['file']}:{p['line']}"
                       f"{' (base)' if p['side'] == 'base' else ''} | {md_escape(change)} | "
                       f"{len(p['consumers']) - o} / {o} | {len(p['tests'])} | **{p['risk']}** | "
                       f"{md_escape('; '.join(p['reasons']))} |")
    else:
        out.append("No Drupal pieces touched.")
    out += ["", "## Consumers", ""]
    any_c = False
    for p in r["pieces"]:
        if not p["consumers"]:
            continue
        any_c = True
        out.append(f"### `{p['id']}` ({LABEL[p['kind']]}, {p['risk']})")
        if p.get("before"):
            out += [f"- before: `{md_escape(p['before'])}`", f"- after: `{md_escape(p['after'])}`"]
        for c in sorted(p["consumers"], key=lambda c: (not c["outside"], c["module"], c["file"], c["line"]))[:MD_CONSUMER_CAP]:
            where = "outside" if c["outside"] else "inside"
            out.append(f"- `{c['file']}:{c['line']}` [{c['module']}, {where}, {c['how']}] `{md_escape(c['text'])}`")
        if len(p["consumers"]) > MD_CONSUMER_CAP:
            out.append(f"- … {len(p['consumers']) - MD_CONSUMER_CAP} more in impact.json")
        out.append("")
    if not any_c:
        out += ["None found.", ""]
    out += ["## Tests to run first", ""]
    if r["tests_to_run"]:
        out += [f"- `{t['file']}` ({t['suite']}) covers {', '.join(f'`{x}`' for x in t['pieces'])}" for t in r["tests_to_run"]]
    else:
        out.append("None found.")
    if r["update_hooks_in_diff"]:
        out += ["", "Update hooks in the diff: " + ", ".join(f"`{u['file']}:{u['line']}`" for u in r["update_hooks_in_diff"])]
    if r["unclassified_changes"]:
        out += ["", "## Changes with no detected Drupal piece", ""]
        out += [f"- `{u['file']}` lines {u['lines']}{' (base)' if u['side'] == 'base' else ''}" for u in r["unclassified_changes"]]
    if r["pieces"]:
        out += ["", "## Diagram", "", "```mermaid", mermaid.rstrip(), "```"]
    out += ["", "## Not detected by this scanner", ""]
    out += [f"- {n}" for n in r["not_detected"]]
    return "\n".join(out) + "\n"


def render_mermaid(r, max_nodes):
    def mid(prefix, i):
        return f"{prefix}{i}"

    def q(s):
        return '"' + str(s).replace('"', "#quot;") + '"'

    out = ["graph LR"]
    edges, nodes = [], 0
    out.append(f"  subgraph changed[{q('changed in ' + r['module'])}]")
    for i, p in enumerate(r["pieces"]):
        label = f"{LABEL[p['kind']]}: {p['id'].rsplit(chr(92), 1)[-1]}<br/>{p['change']}"
        out.append(f"    {mid('p', i)}[{q(label)}]:::{p['risk'].lower()}")
        nodes += 1
    out.append("  end")
    by_module = {}
    budget = max(max_nodes - nodes, 0)
    for i, p in enumerate(r["pieces"]):
        files = {}
        for c in p["consumers"]:
            files.setdefault((c["module"], c["file"]), []).append(c)
        items = sorted(files.items(), key=lambda kv: (not kv[1][0]["outside"], kv[0]))
        share = max(1, budget // max(len(r["pieces"]), 1))
        for (module, f), cs in items[:share]:
            by_module.setdefault(module, {})
            if f not in by_module[module]:
                by_module[module][f] = mid("c", sum(len(v) for v in by_module.values()))
            edges.append(f"  {mid('p', i)} --> {by_module[module][f]}")
        if len(items) > share:
            extra = mid("m", i)
            out.append(f"  {extra}[{q(f'+{len(items) - share} more files')}]")
            edges.append(f"  {mid('p', i)} -.-> {extra}")
    for module, fs in sorted(by_module.items()):
        out.append(f"  subgraph mod_{re.sub(r'[^A-Za-z0-9_]', '_', module)}[{q(module)}]")
        for f, node in fs.items():
            out.append(f"    {node}[{q(os.path.basename(f))}]")
        out.append("  end")
    out += edges
    out += ["  classDef high fill:#fdd,stroke:#c00,color:#600",
            "  classDef medium fill:#ffe9c2,stroke:#d80,color:#640",
            "  classDef low fill:#e6f4e6,stroke:#393,color:#030"]
    return "\n".join(out) + "\n"


# --------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------

def main(argv=None):
    ap = argparse.ArgumentParser(description="Map what a Drupal module change touches and what depends on it.")
    ap.add_argument("module_dir", nargs="?", default=".")
    ap.add_argument("--base")
    ap.add_argument("--head")
    ap.add_argument("--symbols")
    ap.add_argument("--scan", nargs="+", default=[], metavar="PATH")
    ap.add_argument("--format", choices=["md", "json", "mermaid", "all"], default="md")
    ap.add_argument("--out")
    ap.add_argument("--max-nodes", type=int, default=40)
    ap.add_argument("--fail-on", choices=["high", "medium"])
    args = ap.parse_args(argv)

    if args.format == "all" and not args.out:
        ap.error("--format all needs --out DIR")
    cwd = os.path.abspath(args.module_dir)
    if git(cwd, "rev-parse", "--is-inside-work-tree", check=False) is None:
        raise SystemExit(f"{args.module_dir} is not inside a git checkout")
    for root in args.scan:
        if not os.path.isdir(root):
            raise SystemExit(f"--scan root not found: {root}")
    machine = module_name(cwd)
    new_tree = Tree(cwd, args.head)
    head_label = f"{args.head} ({short(cwd, args.head)})" if args.head else "working tree"
    missing, update_hooks, unclassified = [], [], []

    if args.symbols:
        pieces, missing = resolve_symbols(args.symbols.split(","), new_tree, machine)
        base_label = "symbols"
    else:
        if args.base:
            base = git(cwd, "merge-base", args.base, args.head or "HEAD", check=False)
            base = base.strip() if base else args.base
            base_label = f"{args.base} ({short(cwd, base)})"
        else:
            found = default_base(cwd)
            if found:
                base, base_label = found[1], f"merge-base with {found[0]} ({short(cwd, found[1])})"
            else:
                base, base_label = "HEAD", f"HEAD ({short(cwd, 'HEAD')}, no origin default branch found)"
        diff = collect_diff(cwd, base, args.head)
        pieces, unclassified, update_hooks = classify(diff, Tree(cwd, base), new_tree, machine)

    corpus = Corpus(cwd, new_tree, args.scan, machine)
    for p in pieces:
        p["abs"] = os.path.join(cwd, p["file"])
        # Removed/renamed pieces are found by their old ID; it's what callers still use.
        p["consumers"], p["tests"] = find_consumers(p, corpus)
        p["risk"], p["reasons"] = score(p, update_hooks)
        p["file"] = display(os.path.join(cwd, p["file"]))
    if corpus.skipped_copies:
        missing_note = "Skipped other copies of this module under --scan: " + ", ".join(corpus.skipped_copies)
    else:
        missing_note = None
    report = build_report(args, machine, pieces, unclassified, update_hooks, base_label, head_label, missing)
    if missing_note:
        report["notes"].append(missing_note)
    for u in report["unclassified_changes"] + report["update_hooks_in_diff"]:
        u["file"] = display(os.path.join(cwd, u["file"]))
    mermaid = render_mermaid(report, args.max_nodes)
    outputs = {"md": ("impact.md", render_md(report, mermaid)),
               "json": ("impact.json", json.dumps(report, indent=2, ensure_ascii=False) + "\n"),
               "mermaid": ("impact.mmd", mermaid)}
    wanted = outputs if args.format == "all" else {args.format: outputs[args.format]}
    if args.out:
        os.makedirs(args.out, exist_ok=True)
        for name, body in wanted.values():
            with open(os.path.join(args.out, name), "w", encoding="utf-8") as f:
                f.write(body)
        print("\n".join(os.path.join(args.out, n) for n, _ in wanted.values()))
    else:
        sys.stdout.write(next(iter(wanted.values()))[1])
    if args.fail_on and RISKS.index(report["risk"]) >= RISKS.index(args.fail_on.upper()):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
