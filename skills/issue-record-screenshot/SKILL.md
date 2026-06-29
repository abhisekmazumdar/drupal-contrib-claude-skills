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

## Step 3 — Detect browser MCP (prefer Playwright, fall back to Claude-in-Chrome)

**Try Playwright first.** Check if `mcp__playwright__*` tools are available in the current session.

- If yes → use Playwright (step 4a)
- If no → check if `mcp__claude-in-chrome__*` tools are available
  - If yes → use Claude-in-Chrome (step 4b)
  - If neither → tell the user: "No browser session is active. Start Playwright or open Chrome with the Claude-in-Chrome extension, then run this skill again." Stop here.

---

## Step 4a — Screenshot via Playwright (preferred)

Use `mcp__playwright__screenshot` and pass the full destination path:

```
savePath: issues/<nid>/screenshots/<filename>
```

Playwright saves the file directly — no base64 decoding needed.

---

## Step 4b — Screenshot via Claude-in-Chrome (fallback)

Use `mcp__claude-in-chrome__computer` with `action: screenshot`. It returns base64 image data. Save it with:

```bash
echo "<base64_data>" | base64 -d > issues/<nid>/screenshots/<filename>
```

---

## Step 5 — Confirm

Tell the user: "Screenshot saved to `issues/<nid>/screenshots/<filename>`."
