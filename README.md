# Veritas Studio

A local-first writing studio starter built with plain HTML, CSS, and JavaScript. The source is intentionally framework-free so it can be hosted locally or embedded in an Electron/Tauri shell without changing the UI layer.

## Run in a browser

Open `index.html` in a modern browser. For direct folder access, serve the app from `localhost` (for example, with VS Code Live Server) or package it with Electron/Tauri; the browser File System Access API is available in secure contexts and is not supported by every browser. Use **Open vault** to choose a local folder. The app reads and writes `.md` and `.json` files in that folder and remembers the folder handle when browser permissions allow it.

If folder access is unavailable, the app uses a local browser vault stored in `localStorage`. Browser storage is specific to that browser and device and is not included when you commit the app to GitHub.

### Sync project data with GitHub

To keep your manuscripts and planning files alongside the app in its Git repository:

1. Open the project switcher and choose **Copy current project into repository root**.
2. When prompted, select the root folder of your Veritas Studio Git checkout. Veritas copies the current browser project into a new `<project-name>/` folder directly in that root, keeping the original browser copy intact.
3. Commit and push the new project folder to GitHub.
4. On another PC, pull or clone the repository, run Veritas, choose **Open existing folder** in the project switcher, and select that same `<project-name>/` folder.
5. After editing, commit and push the changed data files; pull those changes on the other PC before continuing there.

Folder-backed projects save changes directly to their Markdown and JSON files. GitHub does not sync browser permissions or resolve simultaneous edits, so avoid editing the same project on both PCs before syncing.

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

When copied into the app folder for GitHub sync, the project folder sits directly in the repository root as `<project-name>/`; its manuscript, worldbuilding, plot, and other files live inside that project folder. New projects are managed from the project switcher beside the Veritas logo. **New browser project** creates an isolated browser-local workspace. **New project folder** asks for a parent folder and creates a fresh project directory with a scaffold for manuscript, worldbuilding, ideation, editing, publishing, and plot-planner data. **Copy current project into repository root** copies a browser workspace into a new project folder in the selected repository root. **Open existing folder** adds an existing local vault as a project. Each project has its own files, module selection, and writing statistics; folder handles are remembered when the browser grants persistent access.

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

## Windows application

The Windows app uses Electron and keeps the writing UI shared with the browser version. Its frameless window uses a custom title bar, animated window controls, and a Veritas `V` application icon, with a compact VS Code-inspired desktop layout. The Electron preload bridge exposes only project-folder selection and Markdown/JSON read/write operations; the renderer does not have direct Node.js access. Project folder paths are remembered in Electron's app data, while the project files remain in the selected folders.

Requirements: Windows, Node.js 24, and npm.

```powershell
npm ci
npm start
npm run dist:win
```

The installer is generated in `dist/`. The Windows build uses an NSIS installer and checks GitHub Releases when a packaged app starts and every six hours while it is running. Updates download automatically. When a download is ready, the app offers **Restart now**; choosing **Later** leaves the update ready and installs it automatically the next time the app exits. Running from source does not perform update checks.

### Publish a Windows release

The GitHub Actions workflow `.github/workflows/release-windows.yml` builds and publishes a Windows installer whenever a version tag is pushed:

1. Set the version in `package.json` and commit the change.
2. Create a matching version tag, such as `v1.0.1` for package version `1.0.1`, and push the tag.
3. The workflow publishes the installer and updater metadata (`latest.yml`) to a GitHub Release. Keep the release publicly accessible so installed apps can find it.

For example:

```powershell
git tag v1.0.1
git push origin main
git push origin v1.0.1
```

The first release must be published before installed copies can receive updates. GitHub Releases are the update channel; branch pushes alone do not update installed apps. The update check compares the installed app version with the latest published release and downloads a newer version when available. A Windows code-signing certificate is recommended for a smoother installation experience and fewer SmartScreen warnings.

The app's project manager can create or open folders anywhere on the PC. To keep a project in the Veritas Git repository, use **Copy current project into repository root** and select the checkout folder; the new project folder can then be committed and pushed as usual.

The writing surface provides rich editing in the browser while keeping Markdown as the portable, local-first source format. DOCX export maps supported headings, emphasis, quotes, and lists into the exported document.
