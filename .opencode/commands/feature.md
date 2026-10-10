---
description: Plan a Veritas Studio feature before building it
agent: plan
---

Plan the following feature for Veritas Studio before any code is written.

$ARGUMENTS

Return a short plan that covers:

1. The goal in one sentence.
2. The exact files and sections to touch. `app.js` is a single large file, so
   name the functions/areas involved and how you found them (grep).
3. The smallest safe implementation that fits existing patterns.
4. Whether it needs new Electron IPC / preload bridge work or file access, and
   how to keep renderer security intact.
5. Risks and edge cases, including anything that affects the browser build or
   saved Markdown/JSON formats.
6. The manual steps to verify it after `npm start`.

Do not edit files yet.
