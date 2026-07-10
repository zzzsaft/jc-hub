# ERP SQL Reference Retrieval

ERP SQL Agent uses historical FineReport SQL as retrieval references for LLM fallback generation. The references are not executable templates; generated SQL still goes through production `SqlRuntimeGuardService`, which combines current-schema validation with question/analysis-plan family and metric validation.

## Data Flow

1. `sql-template:import-cpt` imports raw SQL into `erp_agent.sql_template_dataset`.
2. `sql-template:build-reference-index --apply` builds `erp_agent.sql_dataset_reference_index`.
3. `sql-template:build-reference-embeddings --apply` optionally fills JSONB embeddings for index rows.
4. `findSqlReference` searches dataset-level references first, then family-level references from `erp_sql_reference_family`.
5. `generateSql` receives the top dataset references as hints. Dataset retrieval is capped at 10 rows. Dataset matches include SQL preview text; family references only fill in broader fallback context.
6. Before return or execution, runtime compares required family/metrics with the candidate references and SQL family evidence. A low-confidence but matching estimate may continue with a disclaimer; a mismatched family is rejected with public `sql=""`.

## Index Fields

The index stores dataset metadata, derived natural-language question text, full SQL text, family metadata, extracted table/field/metric/param keywords, time scope, business scenario, finance and verification flags, risk flags, a short SQL preview, and optional embedding fields. Question text prefers linked template `normalized_question/question_pattern` values, then report, dataset, family, and metric context, with table-name fallback so the field is never empty. Time scope records relative-date usage and date-like fields, or `未识别时间口径` when no time signal is found. Business scenario uses family/report/dataset context first, then a table-name fallback. When no family is linked, module is inferred from core table names for the common finance, purchase, sales, inventory, and production modules; intent is inferred as `aggregate` for grouped/aggregate SQL and `detail` otherwise. Table extraction keeps multi-part names such as `JCJDY.dbo.ProductQuotationDetail`. Fields are extracted after stripping params, macros, and string literals. Params come from imported FineReport metadata plus SQL text patterns such as `@param`, `${param}`, and `$P{param}`. `verified=true` means the dataset is linked to an approved template with `guard_passed=true`; family membership alone is not treated as verification. If `embedding_text` changes during index rebuild, old `embedding_vector_json`, `embedding_model`, and `embedding_updated_at` are cleared.

Current mixed scoring uses:

- semantic token overlap from question text, report name, dataset name, family description, scenario, and keywords
- table, field, and parameter matches
- family/module/intent matches
- metric terms such as revenue, cost, gross profit, receivables, paid amount, refund, and tax
- finance and verified-reference boosts

Dataset retrieval defaults to mixed scoring only and uses a short in-process cache for repeated reference lookups. The default SQL query does not fetch `embedding_vector_json`, so large stored vectors are not transferred unless online query embedding is enabled. If online query embedding is explicitly enabled with `ERP_SQL_REFERENCE_QUERY_EMBEDDING=1`, and `ERP_SQL_EMBEDDING_API_KEY` or `OPENAI_API_KEY` is configured with `ERP_SQL_EMBEDDING_TRUSTED=1`, retrieval embeds the user question and reranks rows that already have `embedding_vector_json`: `0.75 * mixedScore + 0.25 * vectorScore`. Rows without vectors, missing embedding config, untrusted embedding config, disabled online query embedding, embedding timeout, or embedding failures automatically fall back to mixed scoring. `matchedSignals` includes `vector:<score>` when vector reranking contributed. `ERP_SQL_REFERENCE_SOFT_TIMEOUT_MS` can cap a reference lookup and return an empty result for that branch so LLM fallback can continue; the default is 2500ms. Prisma does not expose reliable per-query hard cancellation in the current client. A lookup that already reached Prisma is isolated as bounded shared cache work, observed as `detachedReferenceWork`, and removed from the active set when it settles; queued request-bound work and the caller wait are still cancelled immediately. `ERP_SQL_REFERENCE_EMBEDDING_TIMEOUT_MS` caps online query embedding; the default is 1200ms.

## Operations

Dry run:

```bash
npm run sql-template:build-reference-index -- --dry-run
```

Apply:

```bash
npm run sql-template:build-reference-index -- --apply
```

The script is idempotent and upserts by `dataset_id`.

Build embeddings:

```bash
npm run sql-template:build-reference-embeddings -- --dry-run
npm run sql-template:build-reference-embeddings -- --apply
```

Options: `--limit`, `--force`, `--batch-size`, and `--model`. The default model is `text-embedding-3-small`. Configure `ERP_SQL_EMBEDDING_API_KEY` or fallback `OPENAI_API_KEY`; `ERP_SQL_EMBEDDING_BASE_URL` is optional for OpenAI-compatible gateways. Before `--apply`, confirm the endpoint is approved for ERP reference text and set `ERP_SQL_EMBEDDING_TRUSTED=1`; otherwise the client refuses to send embedding text. LLM logs use purpose `erp_sql_reference_embedding` and record only batch size, model, and dimension.

Audit coverage and smoke retrieval:

```bash
npm run sql-template:audit-reference-index
```

Use `-- --strict` to fail when indexed row count is below dataset count, required searchable fields are empty, or any built-in smoke question returns no dataset reference. Add `--require-embeddings` to also require full vector coverage, non-empty model names, one consistent vector dimension, and at least one smoke result with a `vector:*` signal.

Inspect Top references for one question:

```bash
npm run sql-template:search-reference -- --question=查本月收入和税额 --limit=10
```
