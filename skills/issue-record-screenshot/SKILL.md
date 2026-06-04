---
name: issue-record-screenshot
description: >
  Capture a Playwright screenshot of the current browser state and save it to
  issues/<nid>/screenshots/. Use when the user says "screenshot this", "capture the
  current state", "take a screenshot for the issue record", or when documenting
  a visual state during issue work.
argument-hint: <nid> [<label>]
---

# /issue-record-screenshot

**Purpose:** Capture a timestamped screenshot into the issue's screenshots directory.

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

- Use today's date and the current time
- Replace spaces in label with hyphens, lowercase everything
- Example: `2026-06-03-143022-admin-form.png`

---

## Step 3 — Take the screenshot

Use the Playwright MCP tool to capture a screenshot and save to `issues/<nid>/screenshots/<filename>`.

If no browser session is open, tell the user: "No browser session is active. Use the playwright-cli skill to navigate to the page first, then run this skill again."

---

## Step 4 — Confirm

Tell the user: "Screenshot saved to `issues/<nid>/screenshots/<filename>`."
