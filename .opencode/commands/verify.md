---
description: Review the working tree and list manual verification steps
---

Review the current Veritas Studio working tree for correctness and regressions.
Report findings in severity order with file and line references.

Working tree:
!`git status --short`
!`git diff --stat`

There are no automated tests. End with the exact manual steps to verify the
change in the running app:

1. Start with `npm start`.
2. List what to click and what to expect to see.
3. Note anything that should also be checked in the browser build.
