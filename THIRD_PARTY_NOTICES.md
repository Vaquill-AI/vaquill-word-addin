# Third-Party Notices

This add-in reuses open-source components. Their licenses are preserved in `node_modules` and summarized here.

## office-word-diff

- Source: https://github.com/yuch85/office-word-diff
- License: Apache License 2.0
- Use: the client-side redline engine. It applies word-level text diffs inside Word via Office.js as native tracked changes, with a cascading fallback (token map, sentence diff, block replace).
- Where: consumed in `src/office/redline.ts` via `applyWordDiff`. Vaquill AI owns the surrounding grounded-anchoring, change-tracking mode handling, and grounding gate.

Apache-2.0 requires that we retain the copyright notice, the license text, and any NOTICE file from the upstream project. These are preserved in `node_modules/office-word-diff`. This project does not modify the upstream source; it consumes the published package.

## diff-match-patch

- License: Apache License 2.0
- Use: transitive dependency of office-word-diff (core diff algorithm).
