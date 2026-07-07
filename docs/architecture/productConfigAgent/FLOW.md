# ProductConfigAgent Flow

## Contract Processing

1. `registerDocument` delegates to block parsing workflow.
2. Block parsing computes sha256, reuses an existing document by hash when present, parses Excel blocks when needed, and updates document status to `parsed`.
3. `extractDocument` runs planned extraction against stored blocks.
4. LLM output is validated as raw extraction only; dictionary-normalized fields are rejected at this stage.
5. Normalization applies dictionary aliases, product routing, split fields, number/unit/range/selection rules, qualifiers, notes, and document info rules.
6. Candidate refresh records unresolved term/value/unit candidates for governance.

## Governance To Archive

1. Candidate review changes dictionary terms, aliases, value splits, term type metadata, or candidate status.
2. Dictionary-changing reviews mark affected documents dirty and bump dictionary version.
3. Dirty refresh renormalizes affected extractions, refreshes candidates, and refreshes existing archives.
4. Archive readiness checks blockers and warnings before archive creation.
5. Archive patching validates JSON paths, syncs archive columns/items/bindings, and writes version snapshots.

## Background Jobs

`background_jobs` is the single recoverable worker queue. Workers claim queued or stale-running jobs, write progress to `resultJson`, and retry failures through `failJob`.

Supported job types include:

- `pending_llm_upload`
- `dictionary_dirty_refresh`
- `concept_resolver_backfill`
- `dictionary_health_audit`
- `archive_dirty_refresh`
- `daily_maintenance`

## Deletion Gate

The legacy repo can be removed only when `DELETION_CHECKLIST.md` has no high-risk unmapped items and the full verification command set passes.
