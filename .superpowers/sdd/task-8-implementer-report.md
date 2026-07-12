# Task 8 Implementer Report

## Capability publication

- `operation.labor_reporting`: published. Evidence: approved `family_092` `Erp.LaborDtl` template from `20260710030000_erp_golden_family_fast_paths`; physical fields were previously compiled/executed against ERP. SQL is `TOP 100`, filters `LaborDtl.Company`, and excludes metadata-only `ResourceDesc/EmployeeName`.
- `operation.resource_group`: not published. `family_014` only groups department/resource values observed in historical `LaborDtl`; it cannot prove master membership or ownership. Reason: `missing_verified_master_data`.
- `operation.master_data`: published. Evidence: `Erp.OpMaster.Company/OpCode/OpDesc` schema and real read-only execution. The migration publishes the bounded template and explicitly excludes unverified `OpMaster.Void`.
- `inventory.safety_stock`: not published. Only draft/mock evidence confirms `PartWhse.SafetyQty`; the existing approved `family_089` asset implements last-receipt aging, not the safety-stock comparison contract. It remains `unsupported` with `missing_approved_data_source`.

## TDD and safety checks

- RED observed: operation registry entries were unsupported and asset promotion returned five rather than eight templates; six assertions failed before implementation.
- GREEN: promotion now reuses only the verified `family_038/092` SQL shapes. Tests enforce `SELECT TOP 100`, Company predicates, production access mapping, access-scope rewriting, and semantic runtime guard acceptance.
- Labor golden: 4 execute cases have no missing contract requirement or bind `jobNum`/`resourceGroupId`; the unbound “今天” and named “维修组” cases remain unsupported. All 7 resource master/membership cases remain unsupported.
- Rollback: `ERP_SQL_OPERATION_LABOR_REPORTING_ENABLED` and `ERP_SQL_OPERATION_MASTER_DATA_ENABLED` default to disabled and require the exact value `true`; otherwise runtime removes executable status with `capability_disabled` before SQL paths.
- Three observed safety-stock requests (`所有低于安全库存的物料`, `哪些物料库存不足`, `查安全库存不足清单`) explicitly return unsupported before SQL execution.
- No guard was weakened and no question-specific execution exception was added.

## Verification

- Mastra, template execution, capability, promotion, runtime-guard and access suite — 134 passed.
- `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/agent npm run prisma:validate` — passed; placeholder URL was used only because no database environment was available and validate does not connect.
- `npm run build:server` — passed.
- Webpage golden subset was not run here; Task 10 owns the shared browser run. Suggested subset: all golden cases whose capability is `inventory.safety_stock` or starts with `operation.` at concurrency 2, running once with switches disabled and once with only the reviewed capability enabled.

## Deliberately unchanged

- `planner/service/scenarios.ts` was audited but not changed: capability publication and approved-template fast paths do not use legacy `QueryPlanScenario`; adding unused operation scenarios would create dead routing state.
- No database was queried because this worktree has no DB/ERP credentials. No fields or joins were inferred beyond approved migrations and recorded real-execution evidence.
