# Veritas Studio

A local-first writing studio for long-form fiction. Users draft manuscripts in
Markdown and keep worldbuilding, plot-planning, editing, and publishing data
beside them as JSON. Files stay portable; nothing is locked into a proprietary
format.

## Stack

- Electron 44 desktop app; the same UI also runs in a browser.
- Framework-free frontend: plain HTML, CSS, and JavaScript. No bundler, no
  React/Vue/Svelte.
- Node.js 24 required.

## Layout

- `app.js` — the entire renderer application (~4,700 lines, one file).
- `index.html` — renderer markup.
- `styles.css` — all renderer styling.
- `electron/main.cjs` — main process, window, app menu, auto-updates.
- `electron/preload.cjs` — context-isolated IPC bridge.
- `assets/` — icons and README banner.

## Commands

- `npm ci` — install; use `npm ci` (not `npm install`) to respect the lockfile.
- `npm start` — run the app (`electron .`).
- `npm run dist:win` — build the Windows NSIS installer into `dist/`.

There is **no test suite**. Verify changes by running the app and exercising the
affected flow by hand. Say what to click and what to expect.

## Conventions

- Keep the frontend framework-free and dependency-light. Prefer platform APIs
  over new packages.
- Match the existing style in `app.js`: no modules or bundler, plain functions
  and DOM APIs.
- Manuscript content is Markdown; project data is JSON. Preserve those formats
  and keep them portable.
- Renderer security: keep `contextIsolation` on and `nodeIntegration` off. Add
  OS/file access through the `electron/preload.cjs` bridge and handle it in
  `electron/main.cjs`; never `require` Node modules in the renderer.
- Do not edit `dist/` (build output).

## Working in `app.js`

- It is a single large file. Grep for symbols instead of reading it end to end.
- Make surgical, scoped edits. Follow surrounding patterns rather than
  restructuring.
- A feature often spans `app.js` + `styles.css`, and sometimes
  `preload.cjs`/`main.cjs` for file or OS access.

## Git

- Small, focused commits.
- Never push without explicit approval.
