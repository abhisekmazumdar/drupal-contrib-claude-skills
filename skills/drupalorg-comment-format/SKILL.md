---
name: drupalorg-comment-format
description: >
  Apply Drupal.org text formatting rules when writing comment replies, issue
  descriptions, or any text destined for Drupal.org. Use this skill when the
  user asks to "write a comment for Drupal.org", "reply to a Drupal issue",
  "create a Drupal.org issue", "draft issue description", "help me comment on
  this issue", or similar requests targeting Drupal.org text input fields.
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
| Goal | Tag |
|------|-----|
| Bold | `<strong>text</strong>` |
| Italic | `<em>text</em>` |
| Strikethrough | `<del>text</del>` or `<s>text</s>` |
| Underline | `<u>text</u>` |
| Headings | `<h2>` ... `<h6>` (no `<h1>`) |
| Blockquote | `<blockquote>text</blockquote>` |
| Superscript | `<sup>text</sup>` |
| Subscript | `<sub>text</sub>` |

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

### Special characters
Use HTML entities where needed:
- `&amp;` for &
- `&lt;` for <
- `&gt;` for >
- `&quot;` for "

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

> **Canonical source:** The voice rules below are the technical register subset of the global `write-like-abhisek` skill. If the two ever diverge, `write-like-abhisek` is authoritative — update both together.

All Drupal.org content must follow Abhisek Mazumdar's technical writing voice:

**Register**
- No greeting, no opener. Start with the fact, status, or problem.
- Short declarative sentences — one thought per sentence.
  - ✅ "This is open for review now."
  - ❌ "I wanted to let you know that the patch is now ready for review."
- State completed work with "I have..." — active voice, past tense: "I have added a new field." "I have created a new MR for 2.0.x and closed the old one."
- Ask for specific help precisely: "Please help me find any remaining corner cases I might have missed." Never vague.
- Bug reports: show the error inline, name what's missing, stop. No narrative around it.
- Status updates are one line: "The MR functions correctly. I'm marking this as RTBC."

**Vocabulary to never use**
- Transition padding: "Additionally," "Furthermore," "Moreover," "In conclusion," "It is worth noting that"
- Significance inflation: "pivotal," "crucial," "underscores," "testament," "highlights," "reflects broader," "stands as," "serves as a reminder"
- AI tells: "delve," "intricate," "tapestry," "garner," "align with," "bolstered," "fostering," "showcasing," "nuanced"
- Elaborate copulatives: replace "serves as" / "stands as" / "functions as" with "is"

**Never write**
- "As you can see..."
- "I hope this helps!"
- "Please let me know if you'd like me to expand on any of these points."

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

### Pre-output: humanizer pass

Before presenting any output, run `/humanizer` on the drafted text to strip residual AI writing patterns. The Voice and Tone rules above are the guide; the humanizer is the automated catch for anything that slips through. Apply its suggestions, then proceed to the two-block output below.

Always produce **two blocks** when responding:

### 1. HTML source (paste this into Drupal.org)

Present the raw HTML output inside a fenced code block labelled `html` so the
user can copy it directly and paste it into the Drupal.org text field.

```html
<!-- The actual HTML-formatted content goes here -->
```

### 2. Rendered preview (for reading in this chat)

Immediately after the HTML block, show a **Markdown preview** of the same
content so the user can read it naturally in the chat interface without having
to mentally parse raw HTML. Label it clearly, for example:

---
**Preview (how it will look on Drupal.org):**

> ...rendered content here using Markdown equivalents...

---

Rules for the preview:
- Convert `<strong>` to `**bold**`, `<em>` to `*italic*`, `<code>` to backtick code.
- Convert `<h2>`/`<h3>` to `##`/`###` Markdown headings.
- Convert `<ul>`/`<ol>`/`<li>` to Markdown list syntax.
- Convert `<pre><code>` blocks to triple-backtick fenced blocks.
- Convert `<blockquote>` to `>` Markdown blockquotes.
- Keep issue references like `[#1234]` as-is in the preview — they are self-explanatory.
- The preview is for reading only; the HTML block is what gets pasted into Drupal.org.
