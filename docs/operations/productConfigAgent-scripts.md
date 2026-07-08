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

Run scripts from the repo root after loading the same environment used by the API server.

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
