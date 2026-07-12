## Task 5 report

### Implemented

- Added frontend DTOs for the redacted v2 task list, annotations, evidence, revisions, and save state.
- Added a typed service over the existing v2 list/draft/submit endpoints.
- Added pure Chinese evidence-card mapping that ignores every `prediction` branch.
- Added submit validation for evidence, admission reasons, unresolved auto-archive fields, package sufficiency, and unique ERP matches.
- Added `useFullReviewState` with one 1200 ms draft timer, server-response-only revision updates, typed update functions, validation, submit, and skip.
- Draft failures change only `saveState`; they do not restore a request snapshot, so edits made during or after the failed request remain intact.

### TDD and verification

- RED: `node --test --import tsx apps/server/test/productConfigAgent/goldenSetFullReviewUiMapping.test.ts` failed with `ERR_MODULE_NOT_FOUND` before production files existed.
- GREEN: the same node:test command passed both mapping and validation tests.
- `npm run build:web` passed. It reported pre-existing duplicate package-script key and large-chunk warnings.

### Scope

- No dependency or lockfile changes were made.
- Existing unrelated worktree changes were left untouched.

### Review fixes

- Mirrored backend ERP mapping coverage, decision cardinality, and duplicate identity validation on the client, including empty ERP rejection for sellable auto-archive packages.
- Extracted a pure revisioned autosave coordinator so draft writes are serialized and always use the latest server revision.
- Edits arriving during an in-flight draft are retained as one pending save; failed writes retain the newest pending annotation for retry.
- Submit now flushes and awaits drafts before using the latest revision. Task generations suppress late revision/save-state callbacks after navigation.
- Added node:test coverage for ERP invariants, serialized in-flight edits, submit flushing, and late responses from an old task.
