# Legacy Repository Deletion Checklist

Legacy source: `/Users/zzzsaft/Documents/GitHub/jdy_backend/src/features/productConfigAgent`

## Required Gates

- [ ] `npm run prisma:validate` passes.
- [ ] `npm run build` passes.
- [ ] `npm test` passes.
- [ ] No production route is available only in the legacy repo.
- [ ] No operational script is available only in the legacy repo without a current replacement or explicit deprecation.
- [ ] No high-risk legacy test category lacks a current equivalent.

## Current Replacements

- Documents/blocks/extractions: `service.ts`, `workflow/blockParsing.service.ts`, `extraction/plannedExtraction.ts`.
- Dictionary governance: `dictionary/governance.service.ts`, suggestion helpers, concept resolver, policy/target scoring, multi-value, qualifier, value-like field detection.
- Archive: `archive/archive.service.ts`, `archive/jsonPatch.ts`, `archive/productConfigSearch.service.ts`.
- Agent runtime/tools: `agent/*`, `tools/*`, generated configs in Prisma.
- Workflow/Ops: `worker/backgroundWorker.ts`, `workflow/pendingLlmJob.service.ts`, `workflow/dailyMaintenance.service.ts`.
- Scripts: current npm scripts in `package.json` cover worker, parse production details, duplicate report/apply, full normalization, concept resolver audit/backfill, master-data refresh, qualifier consolidation, cross-concept reextract, Excel block option upgrade.

## Explicitly Deprecated Legacy Internals

- TypeORM entity classes are not migrated as runtime dependencies.
- Old provider-specific extraction scripts are replaced by routed LLM calls and current npm scripts.
- Old in-memory-only job status objects are replaced by `background_jobs` progress/result JSON.

## Final Manual Check

Before deleting the legacy repo, compare old file categories against current replacements and record any remaining intentional deprecations in this file.
