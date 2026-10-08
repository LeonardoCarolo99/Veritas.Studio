# Veritas Studio

A local-first writing studio starter built with plain HTML, CSS, and JavaScript. The source is intentionally framework-free so it can be hosted locally or embedded in an Electron/Tauri shell without changing the UI layer.

## Run

Open `index.html` in a modern browser. For direct folder access, serve the app from `localhost` or package it with Electron/Tauri; the browser File System Access API is available in secure contexts and is not supported by every browser. Use **Open vault** to choose a local folder. The app reads and writes `.md` and `.json` files in that folder and remembers the folder handle when browser permissions allow it.

If folder access is unavailable, the app uses a local browser vault stored in `localStorage`. The browser fallback can import readable Markdown/JSON files, but edits are saved to browser storage; the original selected folder is not changed.

## Vault layout

The starter browser vault includes:

```text
Manuscript/
Worldbuilding/
  Characters/
  Locations/
  Factions/
Timelines/
Todos/
config.json
```

New projects are managed from the project switcher beside the Veritas logo. **New browser project** creates an isolated browser-local workspace. **New project folder** asks for a parent folder and creates a fresh project directory with a scaffold for manuscript, worldbuilding, ideation, editing, publishing, and plot-planner data. **Open existing folder** adds an existing local vault as a project. Each project has its own files, module selection, and writing statistics; folder handles are remembered when the browser grants persistent access.

## Lifecycle modules

Projects can enable only the stages they need from the project manager. The active stages appear as navigation buttons in the binder:

- **Ideation** stores a logline, premise, and conceptual notes in `Ideation/ideas.json`.
- **Writing** provides the manuscript and worldbuilding binder, editor, and visual plot planner.
- **Editing** stores named manuscript snapshots and revision checklists in `Editing/revisions.json`.
- **Publishing** provides a catalog and per-book profitability dashboard, tracks expenses and earnings in `Publishing/portfolio.json`, and keeps book metadata, blurbs, elevator pitches, author bio, launch notes, and a release checklist in the Publishing workspace (`Publishing/launch.json` retains the launch notes and checklist).

At least one module must remain enabled. New projects start with Writing enabled and the other stages off; modules can be enabled at any time without moving project files.

The **To-do** view is available in every project, regardless of enabled lifecycle modules. Tasks are stored in `Todos/tasks.json`.

## Plot planner

Open **Plot planner** from the Writing module navigation or the Inspector. Add plot threads, event blocks, and story arcs; switch between Surface and Shadow layers; filter to a single thread; and drag event blocks along the story or into another thread. Structured planner data is stored in `Timelines/Plot planner.json`, separately from the simple Markdown timeline notes.

New chapter, character, location, faction, and timeline actions create files in the corresponding folders. Worldbuilding entries are paired Markdown notes and JSON metadata files; their structured fields are configured in the entity schema editor and stored under `schemas` in `config.json`. The timeline panel reads and writes simple `- marker | event` entries.

## Included features

- File/Edit/Window/Export menu bar, chapter-level and full-manuscript export, collapsible/resizable sidebars, and handle-only panel docking
- Dedicated Manuscript and Worldbuilding binder trees, with character/location/faction templates and JSON-backed structured fields
- Add custom text, number, dropdown, and long-text template fields in the entity schema editor
- Categorized application menus, an export settings dialog, and persistent theme/editor/writing/vault preferences
- Settings categories for appearance (Midnight, Paper, Sepia, Coffee, and Sci-Fi themes), interface scaling, editor size/width, writing goals, entity templates, and vault details
- Isolated multi-project workspaces with browser-local storage or newly created/opened local folders
- Per-project progressive disclosure for Ideation, Writing, Editing, and Publishing lifecycle modules
- A publishing studio with per-book ISBN and release metadata, marketing copy, expense and earnings ledgers, and portfolio-level profit reporting
- A visual story planner with plot threads, event blocks, Surface/Shadow layers, and ranged story arcs
- A project-scoped to-do list with task completion and deletion

The Export menu opens a desktop-sized settings dialog where the user can choose the current document, a specific chapter, or the full manuscript; choose DOCX, print-to-PDF, or Markdown; and configure title pages and chapter page breaks.
- Rich-text manuscript editor with paragraph styles, headings, emphasis, quotes, ordered and unordered lists, undo/redo, find and replace, paste sanitization, live word count, reading time, and a daily goal; documents continue to save as Markdown
- The Sorth scanner links worldbuilding notes mentioned in the current document
- Vault-wide search and Markdown, DOCX, and print-to-PDF export
- Local autosave, folder permission restoration, and a browser-only fallback

DOCX export produces a minimal Office Open XML document without a runtime dependency. PDF export opens the system/browser print dialog; choose **Save as PDF** there.

## Desktop shell integration

For Electron, load `index.html` in a `BrowserWindow` with context isolation enabled; keep Node access in a narrow preload bridge if native dialogs or OS integration are needed. For Tauri, use the same UI and replace the folder picker/writer functions in `app.js` with the filesystem plugin APIs. Do not enable unrestricted renderer filesystem or Node access. A production desktop build should add shell manifests, signing, and platform-specific permission/error handling.

The writing surface provides rich editing in the browser while keeping Markdown as the portable, local-first source format. DOCX export maps supported headings, emphasis, quotes, and lists into the exported document.
