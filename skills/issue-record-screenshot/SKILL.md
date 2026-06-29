---
name: issue-record-screenshot
description: >
  Capture a screenshot of the current browser state and save it to issues/<nid>/screenshots/. Use when the user says "screenshot this", "capture the current state", "take a screenshot for the issue record", or when documenting a visual state during issue work. Requires the Claude-in-Chrome browser extension to be connected.
argument-hint: <nid> [<label>]
---

# /issue-record-screenshot

**Purpose:** Capture a timestamped screenshot into the issue's screenshots directory using Claude-in-Chrome.

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

Call `mcp__claude-in-chrome__tabs_context_mcp` to confirm a browser tab is connected.

If no tab is available, tell the user: "No browser session is active. Open Chrome with the Claude-in-Chrome extension enabled, then run this skill again." Stop here.

---

## Step 4 — Take the screenshot

Use `mcp__claude-in-chrome__computer` with `action: screenshot`. It returns base64 image data. Save it with:

```bash
echo "<base64_data>" | base64 -d > issues/<nid>/screenshots/<filename>
```

---

## Step 5 — Confirm

Tell the user: "Screenshot saved to `issues/<nid>/screenshots/<filename>`."
