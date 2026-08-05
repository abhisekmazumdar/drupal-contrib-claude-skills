---
name: drupalorg-comment-format
description: >
  Use this skill when writing content destined for a Drupal.org issue queue — comments, issue descriptions, issue summaries, or proposed resolutions. Triggers on requests to draft, format, or compose text for Drupal.org issue fields, including explaining a patch, reporting a regression, describing a fix, or updating an issue summary. Covers both classic Drupal.org HTML formatting and GitLab Markdown for migrated queues. Does NOT apply to forum posts, README files, commit messages, GitHub PRs, or general documentation.
version: 1.0.0
---

# Drupal.org Comment & Issue Formatting

**Purpose:** Produce text that is correctly formatted for Drupal.org's text
input fields — comments, issue descriptions, and issue summaries — following
the platform's supported markup rules at https://www.drupal.org/filter/tips

---

## Migrated vs. Non-Migrated Issues

Drupal.org projects fall into two categories. Always determine which before formatting:

| Issue queue | Where comments live | Format to use |
|---|---|---|
| **Non-migrated** (classic Drupal.org) | drupal.org/project/foo/issues/NID | Drupal.org HTML (this skill) |
| **Migrated** (GitLab work items) | git.drupalcode.org/project/foo/-/work_items/NID | **GitLab Markdown** |

**How to detect a migrated queue:** The issue URL contains `/work_items/` or the issue body contains a line like "Migrated from Drupal.org". When migrated, **do not use this skill** — use standard GitLab Flavored Markdown (GFM) instead:
- Fenced code blocks with triple backticks
- `**bold**`, `*italic*`
- `- ` or `* ` for bullet lists
- `## Heading` for headings
- `> blockquote`
- Cross-references: `#NID` for issues, `!NID` for MRs (GitLab syntax)

The AI disclosure line still applies for migrated issues, but uses `_` for italic (Markdown):
`_AI assisted (Claude Code): [what it did]. All commits and decisions are mine._`

---

## When This Skill Applies (non-migrated only)

Activate whenever the user asks you to:
- Write or draft a comment reply for a **non-migrated** Drupal.org issue
- Create or draft a new Drupal.org issue (title + body)
- Update or rewrite an issue summary / "Proposed resolution" section
- Compose any text that will be pasted into a classic Drupal.org text field

---

## Drupal.org Formatting Rules

### Paragraphs and line breaks
- Plain blank lines create paragraph breaks — no `<p>` tags needed.
- A single newline inside a paragraph is treated as a space, not a `<br>`.
- Use `<br>` only when you need a forced line break inside a paragraph.

### Code
- Wrap inline code with `<code>your_code()</code>`.
- Wrap multi-line code blocks with `<pre><code>` ... `</code></pre>`.
- PHP code using `<?php ?>` gets automatic syntax highlighting.
- Do NOT use Markdown fenced code blocks (triple backticks) — they are not rendered on Drupal.org.

### Text emphasis and structure
Standard HTML tags render: `<strong>`, `<em>`, `<del>`/`<s>`, `<u>`, `<blockquote>`, `<sup>`, `<sub>`.
Headings are `<h2>` through `<h6>` — no `<h1>`.

### Lists
```html
<ul>
  <li>Unordered item</li>
</ul>

<ol>
  <li>Ordered item</li>
</ol>

<dl>
  <dt>Term</dt>
  <dd>Definition</dd>
</dl>
```

### Links
- URLs and email addresses are auto-linked — you can paste them bare.
- For labelled links use: `<a href="https://example.com">link text</a>`

### Issue cross-references
- `[#1234]` auto-links to issue #1234 with its title appended automatically.
- `[#1234-2]` links to comment #2 on issue #1234.
- `[#1234@]` also prints the user the issue is assigned to.
- Issue status is shown on hover automatically — no extra markup needed.

### Tables
Use standard HTML table markup: `<table>`, `<tr>`, `<th>`, `<td>`.

### Images
- Only images hosted on drupal.org may be embedded with `<img>` tags.
- External image URLs are replaced with an error icon — never suggest them.

---

## Issue Description Structure

When drafting a **new issue**, follow this standard Drupal.org issue template:

```html
<h2>Problem/Motivation</h2>

Describe what is wrong or what is missing and why it matters.

<h2>Steps to reproduce</h2>

<ol>
  <li>Step one</li>
  <li>Step two</li>
</ol>

<h2>Proposed resolution</h2>

Describe the intended fix or approach.

<h2>Remaining tasks</h2>

<ul>
  <li>Task one</li>
</ul>

<h2>User interface changes</h2>

None. / Describe UI changes if any.

<h2>API changes</h2>

None. / Describe API changes if any.

<h2>Data model changes</h2>

None. / Describe schema/data changes if any.
```

---

## Voice and Tone

All Drupal.org content must follow the `write-like-abhisek` skill's technical
register — that skill is the canonical source; apply it here rather than
restating its rules. Constraints specific to issue-queue content:

- No greeting, no opener — start with the fact, status, or problem.
- Status updates are one line: "The MR functions correctly. I'm marking this as RTBC."
- When responding to reviewer feedback: be candid about position changes. If the reviewer was right, say so plainly. "You are right. I removed it." beats hedged corporate acknowledgement every time.
- A light, honest self-awareness is fine in informal review threads. "After a long back-and-forth with Claude on it, we both came around to agreeing with you" reads as human and direct — don't sanitize it into bland acceptance.

---

## Comment Reply Guidelines

When drafting a **comment reply**:

1. Be concise and specific. Reference the relevant code, function, or line.
2. Use `[#NID]` to cross-reference related issues, `[#NID-N]` for specific comments, and `[#NID@]` to also name the assignee.
3. Wrap all code examples in `<code>` or `<pre><code>` tags.
4. If quoting a previous comment, use `<blockquote>` rather than copy-pasting.
5. Use `<strong>` to highlight important points sparingly.
6. State clearly what action you are taking or recommending.
7. If attaching a patch or MR, mention it explicitly at the end.

---

## Output Format

### Pre-output: humanizer pass (if available)

If the `/humanizer` skill is present in this project, run it on the drafted text before output to strip residual AI writing patterns. It is the automated catch for anything the Voice and Tone rules above missed. If humanizer is not installed, apply those rules manually and proceed.

---

### Always: save to file, no chat preview

Regardless of issue type, write the comment to a file in the issue directory —
do not also print a preview, rendered version, or HTML snippet in chat. The
file is the deliverable.

```
issues/<nid>/comments/YYYY-MM-DD-HHmmss-<label>.md
```

- Create the directory if it does not exist: `mkdir -p issues/<nid>/comments`
- `<label>` — 2–4 word slug derived from the comment purpose, e.g. `review-feedback`, `reroll-note`, `rtbc`
- File always uses `.md` extension
- GitLab (migrated) queues: file content is GitLab Flavored Markdown, pasted as-is.
- Drupal.org (non-migrated) queues: file content is the HTML source, pasted as-is.

---

### After saving: open in the editor

After the file is written, try to open it in the user's editor so they can
review/paste from it directly:

1. If running inside VS Code (or a VS Code-family editor: Cursor, Windsurf) —
   detected via `TERM_PROGRAM=vscode` or the `code` CLI being on `PATH` — run
   `code <path-to-file>`.
2. Otherwise, if a `.git` editor or `$EDITOR`/`$VISUAL` env var is set and
   resolves to a GUI editor with a CLI launcher (e.g. `subl`, `idea`, `zed`),
   use that command instead.
3. If no supported editor can be detected, skip silently — do not print an
   error, just report the file path.

Then tell the user only:
```
Comment saved to issues/<nid>/comments/<filename>.md
```
