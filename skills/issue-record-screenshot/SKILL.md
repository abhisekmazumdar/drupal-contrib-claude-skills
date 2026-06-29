---
name: issue-record-screenshot
description: >
  Capture a screenshot of the current browser state and save it to issues/<nid>/screenshots/. Use when the user says "screenshot this", "capture the current state", "take a screenshot for the issue record", or when documenting a visual state during issue work. Works with any active browser automation MCP (Playwright, Claude-in-Chrome, etc.).
argument-hint: <nid> [<label>]
---

# /issue-record-screenshot

**Purpose:** Capture a timestamped screenshot into the issue's screenshots directory using whatever browser automation MCP is currently active.

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

## Step 3 — Check browser session

Determine which browser automation MCP is active:

- **Playwright MCP** — check if `mcp__playwright__*` tools are available
- **Claude-in-Chrome** — check if `mcp__claude-in-chrome__*` tools are available

If no browser MCP is active, tell the user: "No browser session is active. Start your browser automation tool (Playwright or Claude-in-Chrome), then run this skill again."

---

## Step 4 — Take the screenshot

Use the screenshot action of whichever MCP is active:

- **Playwright:** `mcp__playwright__screenshot` — saves directly to a path; pass `issues/<nid>/screenshots/<filename>` as the save path
- **Claude-in-Chrome:** `mcp__claude-in-chrome__computer` with `action: screenshot` — returns base64 image data; save it with:

```bash
echo "<base64_data>" | base64 -d > issues/<nid>/screenshots/<filename>
```

---

## Step 5 — Confirm

Tell the user: "Screenshot saved to `issues/<nid>/screenshots/<filename>`."
