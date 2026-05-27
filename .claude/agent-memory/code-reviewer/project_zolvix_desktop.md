---
name: project-zolvix-desktop
description: zolvix-desktop is a separate Electron + React + TS app for SO pipeline + LX-310 dot-matrix printing; shares the GPOS server via cookie auth
metadata:
  type: project
---

`zolvix-desktop` is a standalone Electron app at `/Users/glenn/dev/zolvix-desktop` that talks to the main GPOS server over HTTP using cookie auth (`credentials: 'include'`). It manages the sales-order pipeline (create SO → submit → approve → DR → invoice) and prints to an Epson LX-310 dot-matrix via `@thiagoelg/node-printer` ESC/P RAW.

**Why:** It's the dedicated workstation client for back-office staff who don't want a browser tab — and it owns the USB printer driver path that the web app can't reach.

**How to apply when reviewing:**
- Auth uses the same GPOS endpoints (`/api/auth/login`, `/api/auth/session`, `/api/auth/refresh`) — the project rule about `getSessionFromRequest` applies on the *server* side, not in this client.
- The renderer is the trust boundary. Treat the `electron-store` keys (`serverUrl`, `lx310PrinterName`, `formOffsets`, `setupComplete`) as user-controlled — validate values in the main process, not just keys.
- The IPC surface is allowlisted by key — when reviewing new IPC handlers, insist on the same pattern (input validation, no arbitrary passthrough).
- PDF font rule from [[feedback_pdf_font]] applies here too — `print-pdf.tsx` currently uses Helvetica with `P` as a peso placeholder, which is a known TODO.
- The ESC/P builder strips non-ASCII to `?` — peso glyph requires loading PC437/Latin code page and emitting `0xF8`, not just changing the filter.
