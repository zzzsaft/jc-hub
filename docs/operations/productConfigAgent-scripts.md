# ProductConfigAgent Scripts

Available through `package.json`:

- `product-config-agent:worker`
- `product-config-agent:parse-production-detail-excels`
- `product-config-agent:reparse-excel-configs`
- `product-config-agent:report-duplicate-production-detail-documents`
- `product-config-agent:apply-duplicate-production-detail-documents`
- `product-config-agent:normalize-full`
- `product-config-agent:concept-resolver-backfill`
- `product-config-agent:concept-resolver-audit`
- `product-config-agent:refresh-master-data-bindings`
- `product-config-agent:consolidate-qualifier-terms`
- `product-config-agent:reextract-cross-concept`
- `product-config-agent:upgrade-excel-blocks-options`
- `product-config-agent:archive-feature-audit`
- `product-config-agent:archive-feature-verify`
- `product-config-agent:archive-feature-restore`
- `product-config-agent:archive-feature-optimize`
- `product-config-agent:archive-feature-optimize-rollback`
- `product-config-agent:archive-search-diagnostics`
- `product-config-agent:erp-identity-lookup`
- `product-config-agent:erp-identity-ledger`
- `product-config-agent:progress-ledger`
- `product-config-agent:parser-reparse-compare`
- `product-config-agent:product-type-discovery-audit`
- `product-config-agent:golden-set-v1`
- `product-config-agent:golden-set-evaluate`

Run scripts from the repo root after loading the same environment used by the API server.

## Excel Parser Contract

Current persisted parser output is `v2` and should remain cell-only for production extraction:

- `parseExcelFile()` defaults to `includeRowBlocks: false`.
- `ProductConfigAgentBlockParsingService` and `product-config-agent:reparse-excel-configs` also persist cell-only blocks with parser version `v2`.
- Row blocks are only for explicit diagnostics or one-off compatibility checks. Their IDs are namespaced as `row:<sheet>:<row>` so they cannot collide with cell IDs such as `S_R1`.
- Parser metadata now preserves comments as `comment_text` and marks hidden sheet/row/column content with `source.hidden`. Textboxes without sheet relationship mapping use `source.mapping_status: "unmapped"` instead of a fake sheet name.
- `SANITIZED_CONTENT_QUARANTINED` means the parser saw populated cells but the sanitizer dropped most of them due to abnormal control characters. Treat this as a quarantine/input-quality case, not as a successful empty parse.
- `.xls` direct-first parsing falls back to LibreOffice conversion and reports `XLS_CONVERT_FAILED` when conversion is unavailable or fails. Verify `soffice` on the host before a large `.xls` batch.

Before using the SMB server corpus as full coverage, run the read-only Excel parser audit against `/Volumes/jcyxb` or the mounted production share and report how many files were parsed, failed, skipped, hash-deduplicated, and still `unverified_hash`. Do not call this full coverage until the server half is measured.

Use the read-only reparse compare ledger before any mass parser rewrite:

```bash
DOTENV_CONFIG_PATH=/Users/zzzsaft/Documents/jc-hub/.env \
  npm run product-config-agent:parser-reparse-compare -- \
  --out-dir=tmp/product-config-excel-reparse-compare
```

For a smoke run, add `--limit=100`. The command rejects `--apply`; it reparses files with the current parser, compares old/new block counts and `llm_text` hashes, and writes `summary.json`, `parser-reparse-compare.tsv`, `reparse-candidates.tsv`, and `report.md`. Use `reparse-candidates.tsv` as the input list for a later write-enabled reparse only after review.

## Product Type Discovery Audit

Use the read-only stage 2.1 audit to rebuild the 400-document product-package sample, its peer product-family records, alias-risk evidence, ERP product-group hints, and a 100-row technical-question pool.

```bash
npm run product-config-agent:product-type-discovery-audit -- \
  --as-of=2026-07-10 \
  --expected-dictionary-version=1522 \
  --out-dir=tmp/product-config-new-product-type-review-400-v2
```

The command rejects `--apply`. It never writes the database, starts refresh jobs or workers, runs normalization, or calls a business LLM. `--as-of` fixes the date boundary; future block dates cannot enter a recent stratum. `--expected-dictionary-version` stops on dictionary drift instead of silently changing the resolver input.

Outputs include `document-product-packages.tsv`, `document-products.tsv`, `technical-question-samples-100.tsv`, `erp-product-group-reference.tsv`, `new-product-type-candidates.tsv`, `alias-risk-audit.tsv`, `approval-package.json`, `summary.json`, and `report.md`. Compatibility files `document-primary-products.tsv` and `golden-review-100.tsv` contain the package and technical-question shapes; they are not primary-product truth or manual-label work queues.

The output separates die product family (`flat_die`, `coating_die`, `round_die`) from finished form (`board`, `sheet`, `board_sheet`, `film`). ERP ProdCode is only a family hint until an exact PartNum or order line is linked; BOM and price are not inferred from names.

## Stage 2.1 ERP Identity Ledger

Generate the read-only identity ledger for the fixed v3.0 400-package/648-product input:

```bash
DOTENV_CONFIG_PATH=/Users/zzzsaft/Documents/jc-hub/.env \
  node -r dotenv/config --import tsx \
  apps/server/src/modules/productConfigAgent/scripts/auditErpIdentityLedger.ts \
  --input-dir=tmp/product-config-new-product-type-review-400-v2 \
  --out-dir=tmp/product-config-erp-identity-ledger-400-v1
```

The command rejects `--apply`. Outputs are `summary.json`, `input-snapshot.json`, `erp-identity-links.tsv`, `erp-identity-issues.tsv`, `erp-family-conflicts.tsv`, `package-summary.tsv`, and `report.md`. It records only BOM existence and product classification; it does not query price or BOM detail, write either system, or start normalization, refresh, worker, job, or business LLM work.

## Stage 3.1 Golden Set v1

Build the sealed annotation packets, source metadata snapshot, manifest, validator output and prediction-only baseline from the fixed stage 2.1 artifacts:

```bash
CODEX_SANDBOX_NETWORK_DISABLED=0 \
DOTENV_CONFIG_PATH=/Users/zzzsaft/Documents/jc-hub/.env \
npm run product-config-agent:golden-set-v1
```

Evaluate adjudicated copies with `product-config-agent:golden-set-evaluate`. The generator rejects `--apply` and refuses to overwrite packets containing annotations. Metrics remain null until human adjudication. See [Golden Set v1 runbook](product-config-golden-set-v1.md) for schema, annotation, adjudication, metrics and immutability rules.

## Progress Ledger

Use the read-only progress ledger to rebuild a one-row-per-document snapshot from the current database. It separates the latest extraction from the latest normalized extraction, reports status/boolean drift, and summarizes terminal states and blocker codes by document ID band.

```bash
npm run product-config-agent:progress-ledger -- --out-dir=tmp/product-config-progress-ledger --band-size=1000
```

The command prints `summary.json` content to stdout and writes these files by default:

- `summary.json`: total and stage, terminal, readiness, and blocker counts.
- `ledger.tsv`: document-level ledger, including extraction, normalization, archive, duplicate, candidate, and readiness evidence.
- `bands.tsv`: the same counts grouped into document ID bands.
- `report.md`: compact human-readable summary.

For a stdout-only check, use `--no-files`. The command rejects `--apply` and never writes the database, starts jobs or workers, or calls a business LLM.

## ERP Identity Lookup

Use this read-only check when archive readiness is blocked by `missing_item_identity` and the document has enough ERP context to search sales order history. It queries ERP order detail rows through the existing ERP SQL query backend and does not write ERP, ProductConfigAgent, archive, jobs, or LLM logs.

Default smoke targets are document `3950` item `5` and document `3966` item `3`:

```bash
npm run product-config-agent:erp-identity-lookup
```

Focused lookup:

```bash
npm run product-config-agent:erp-identity-lookup -- --document-id=3950 --item-index=5 --limit=20
```

When loading the main project environment outside the API process, use the dotenv preload because the package script itself does not load `DOTENV_CONFIG_PATH`:

```bash
DOTENV_CONFIG_PATH=/Users/zzzsaft/Documents/jc-hub/.env \
  node -r dotenv/config --import tsx \
  apps/server/src/modules/productConfigAgent/scripts/lookupErpIdentityCandidates.ts \
  --document-id=3950 --item-index=5 --limit=20
```

Output candidates include Company + PartNum, product name, ProdCode/ProdGrup, ClassID/PartClass, BOM existence, order/date evidence and confidence clues. `linkPackage()` is the reusable multi-product API and performs one-to-one assignment. Price remains outside this identity service.

Archive feature backfill backups live in `backups/archive-feature/`. Use `product-config-agent:archive-feature-restore -- --backup=backups/archive-feature/<file>.json` for dry-run restore checks, and add `--apply` only when rollback is intentional.

## Archive Feature Read-Only Coverage Audit

Use this runbook when checking whether archive items have enough similarity features for searchable, explainable archive search. This check is read-only by default: do not pass `--apply` unless the task explicitly asks for a database write.

### 1. Full Coverage Verification

```bash
npm run product-config-agent:archive-feature-verify
```

Record these fields from the JSON output:

- `coverage.totalArchives`
- `coverage.totalArchiveItems`
- `coverage.archivesWithSimilarityFeatures`
- `coverage.archivesMissingSimilarityFeatures`
- `coverage.archivesMissingConfirmedSimilarityFeatures`
- `coverage.missing.effective_width_mm`
- `coverage.missing.effective_width_mm_or_die_width_mm`
- `coverage.missing.product_type`
- `coverage.missing.plastic_material`
- `coverage.missing.application`
- `coverage.missing.lip_adjustment_method`
- `coverage.missing.deckle_type`
- `coverage.recoverable.*`
- `smokeQuery.topResults[0..4].similarityScore`
- `smokeQuery.topResults[0..4].matchReasons`

### 2. Dry-Run Backfill Planning

```bash
npm run product-config-agent:archive-feature-audit -- --limit=500 --min-confidence=0.75 --max-updates=100
```

Important: leave out `--apply`. The output should show:

- `mode: "dry-run"`
- `backfill.plannedUpdateCount`
- `backfill.proposedUpdateCount`
- `backfill.appliedUpdateCount: 0`
- `backfill.proposals`

Summarize `backfill.proposals` by:

- `missingFeatureKey`
- `sourceFieldPath` root, such as `confirmedFieldsJson`, `fieldsJson`, `itemName`, `searchableText`, or `archiveJson`
- `confidence`
- risky `proposedValue` values: `other`, `其他`, `无`, `unknown`, `未知`, or overly generic structure values

### 3. Structure Field Review

For `lip_adjustment_method` and `deckle_type`, separately report:

- full missing count from `coverage.missing`
- full recoverable count from `coverage.recoverable`
- high-confidence dry-run proposal count at `minConfidence=0.75`
- candidate values and counts
- source fields and counts
- sample evidence, including `raw_value`, `raw_text`, `field_name`, dictionary canonical value, dictionary display name, dictionary confidence, and match method

Treat candidates as risky when they are:

- `other`, `其他`, `无`, `unknown`, or `未知`
- generic values such as ordinary `外堵式` when the requested decision needs more precision
- low-information text with no useful raw evidence
- below the selected confidence threshold

Current planner note: structure matches recovered only from `itemName` or `searchableText` can be below `0.75`, so they may be recoverable in coverage but excluded from the default dry-run proposal batch.

### 4. Search Impact Smoke Check

Run archive search diagnostics or call `archiveItemSearchService.searchArchiveItems` for these representative queries:

- `1380mm PVC+UPVC 波浪板模头`
- `自动推拉 PVC 板材模头`
- `外堵铣槽式 片材模头`
- `手动推式微调 外堵铣槽式 PP 片材模头`

For each query, record Top 5:

- archive item id
- archive id
- item name
- score
- `matchReasons`
- whether explanations include material, width, application, lip adjustment method, deckle type, and product type

### 5. Expected JSON Summary

Return a JSON object with these top-level keys:

```json
{
  "coverageSummary": {},
  "missingByFeature": {},
  "recoverableByFeature": {},
  "dryRunBackfillSummary": {},
  "structureFieldSamples": {},
  "smokeSearchResults": [],
  "risks": {},
  "recommendedNextBatch": {}
}
```

`recommendedNextBatch` is advice only. Default to:

- `limit: 500`
- `minConfidence: 0.75`
- `apply: false`
- `maxUpdates`: the high-confidence count after excluding risky values

If `other`, `其他`, or `无` are common in structure field candidates, recommend filtering or manual review before any later apply step.

## Archive Feature Optimization Loop

Use this loop when the goal is not only to audit coverage, but also to persist feature candidates, score them with a policy, capture search snapshots, and optionally apply low-risk updates with rollback logs.

Default dry-run-like planning with candidate persistence and no archive item updates:

```bash
npm run product-config-agent:archive-feature-optimize -- --limit=500 --min-confidence=0.75 --max-batch-size=500
```

Controlled apply:

```bash
npm run product-config-agent:archive-feature-optimize -- --apply --limit=500 --min-confidence=0.75 --max-batch-size=500 --auto-apply-min-confidence=0.9
```

Rollback an applied batch:

```bash
npm run product-config-agent:archive-feature-optimize-rollback -- --batch-id=<batch-id> --reason="search regression or policy adjustment"
```

Verify rollback restoration for a batch without changing data:

```bash
npm run product-config-agent:archive-feature-optimize-rollback -- --batch-id=<batch-id> --verify-only
```

The loop writes these tables:

- `agent.archive_feature_backfill_candidates`
- `agent.archive_feature_backfill_logs`
- `agent.archive_search_effect_snapshots`
- `agent.archive_feature_batch_decisions`

Decision defaults:

- auto-apply only trusted low-risk sources, currently `confirmedFieldsJson`
- auto-apply only non-structure features by default
- hold structure fields such as `lip_adjustment_method` and `deckle_type`
- reject `other`, `其他`, `无`, `none`, `unknown`, `未知`
- never overwrite an existing non-empty `similarity_features_json` field

Batch reports include:

- `funnelDiagnostics`
- `coverageDelta`
- `candidateStats`
- `searchImpact`
- `featureImpact`
- `riskSummary`
- `decision`

Treat the system recommendation as an optimization decision signal. Keep human review for high-risk structure fields until enough successful batches prove the policy stable.
