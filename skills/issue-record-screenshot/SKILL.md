---
name: issue-record-screenshot
description: >
  Capture a screenshot of the current browser state and save it to issues/<nid>/screenshots/. Use when the user says "screenshot this", "capture the current state", "take a screenshot for the issue record", or when documenting a visual state during issue work. Requires a connected browser tool or Playwright session.
argument-hint: <nid> [<label>]
---

# /issue-record-screenshot

**Purpose:** Capture a timestamped screenshot into the issue's screenshots directory using the active client's connected browser tooling.

**Usage:** `/issue-record-screenshot <nid> [<label>]`

- `<nid>` — the issue number (required)
- `<label>` — short descriptive label for the filename (optional, default: `screenshot`)

---

## Step 1 — Ensure the directory exists

```bash
mkdir -p issues/<nid>/screenshots
```

---

## Step 2 — Build the filename

Format: `YYYY-MM-DD-HHmmss-<label>.png`

- Use today's date and current time
- Replace spaces in label with hyphens, lowercase everything
- Example: `2026-06-03-143022-admin-form.png`

---

## Step 3 — Check browser connection

Select the available integration without inventing tool names:

- Claude Code with Claude-in-Chrome: inspect the connected tabs using that integration.
- Codex with browser/computer tools: load their instructions and inspect connected tabs.
- Either client with an existing Playwright CLI session: load the installed `playwright-cli` skill and inspect that session.

Use the tab/session the user identified. A new Playwright browser does not inherit the user's open tabs or authentication. If the requested session is unavailable, explain the missing connection and stop instead of capturing a different page.

---

## Step 4 — Take the screenshot

Use the selected integration's documented screenshot operation. Save or export the resulting image to `issues/<nid>/screenshots/<filename>` using its supported file API. If it cannot export a file, report that limitation; do not claim a saved screenshot from an inline preview. Verify that the destination file exists before confirming success.

---

## Step 5 — Confirm

Tell the user: "Screenshot saved to `issues/<nid>/screenshots/<filename>`."
