---
description: Reviews current changes for correctness and regressions without editing files
mode: subagent
permissions:
  - action: edit
    resource: "*"
    effect: deny
  - action: shell
    resource: "*"
    effect: deny
---

Review the current working-tree changes for Veritas Studio.

- List findings in severity order with file and line references.
- Focus on correctness, regressions, Electron/IPC security, and data-format
  compatibility (Markdown manuscripts, JSON project data).
- Note anything that would break the browser build of the shared UI.
- Do not edit files. You may read them.
- End with the manual steps to verify the change in the running app.
