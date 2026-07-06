import { prisma } from "../../lib/prisma.js";

const DOCUMENT_INFO_PATTERN = "(document_info|客户|合同|订单|图纸|日期|交期|备注|说明|产品名称|产品规格|规格)";

async function main() {
  const apply = process.argv.includes("--apply");
  const duplicateOccurrences = await loadDuplicateOccurrenceGroups();
  const occurrenceCounts = await loadOccurrenceCounts();
  const snapshotCounts = await loadSnapshotCounts();

  let updatedSnapshotCandidates = 0;
  if (apply) {
    const [result] = await prisma.$queryRawUnsafe<Array<{ updated_count: bigint }>>(snapshotUpdateSql());
    updatedSnapshotCandidates = Number(result?.updated_count ?? 0);
  }

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        duplicateOccurrenceGroups: duplicateOccurrences,
        occurrenceAlignment: summarizeOccurrenceCounts(occurrenceCounts),
        phase1Snapshot: {
          ...snapshotCounts,
          updatedSnapshotCandidates,
        },
      },
      null,
      2,
    ),
  );
}

async function loadDuplicateOccurrenceGroups() {
  return prisma.$queryRawUnsafe<
    Array<{
      occurrence_key: string;
      duplicate_count: bigint;
      rows: unknown;
    }>
  >(
    `with keyed as (
       select
         o.*,
         coalesce(
           o.occurrence_hash,
           concat_ws(
             '|#phase1-occurrence#|',
             coalesce(o.candidate_type, ''),
             o.candidate_id::text,
             o.extraction_result_id::text,
             o.item_index::text,
             coalesce(o.field_name, ''),
             coalesce(o.raw_value_hash, lower(regexp_replace(trim(coalesce(o.raw_value, '')), '\\s+', ' ', 'g')))
           )
         ) as occurrence_key
       from agent.dictionary_candidate_occurrences o
     ),
     grouped as (
       select occurrence_key, count(*)::bigint as duplicate_count
       from keyed
       group by occurrence_key
       having count(*) > 1
     )
     select
       g.occurrence_key,
       g.duplicate_count,
       jsonb_agg(
         jsonb_build_object(
           'id', k.id::text,
           'candidateType', k.candidate_type,
           'candidateId', k.candidate_id::text,
           'documentId', k.document_id::text,
           'extractionResultId', k.extraction_result_id::text,
           'itemIndex', k.item_index,
           'fieldName', k.field_name,
           'rawValue', k.raw_value,
           'rawValueHash', k.raw_value_hash,
           'occurrenceHash', k.occurrence_hash
         )
         order by k.id
       ) as rows
     from grouped g
     join keyed k using (occurrence_key)
     group by g.occurrence_key, g.duplicate_count
     order by g.duplicate_count desc, g.occurrence_key`,
  );
}

async function loadOccurrenceCounts() {
  return prisma.$queryRawUnsafe<Array<{ candidate_id: bigint; occurrence_count: bigint }>>(
    `select candidate_id, count(*)::bigint as occurrence_count
     from agent.dictionary_candidate_occurrences
     group by candidate_id
     order by count(*) desc, candidate_id
     limit 20`,
  );
}

async function loadSnapshotCounts() {
  const [result] = await prisma.$queryRawUnsafe<
    Array<{
      non_enum_value_candidates: bigint;
      text_value_candidates: bigint;
      document_info_suspected_pollution: bigint;
      snapshot_union_candidates: bigint;
      already_snapshot_candidates: bigint;
      pending_snapshot_candidates: bigint;
    }>
  >(
    `with candidate_flags as (${snapshotCandidateFlagsSql()})
     select
       count(*) filter (where is_non_enum_value)::bigint as non_enum_value_candidates,
       count(*) filter (where is_text_value)::bigint as text_value_candidates,
       count(*) filter (where is_document_info_suspected_pollution)::bigint as document_info_suspected_pollution,
       count(*) filter (where should_snapshot)::bigint as snapshot_union_candidates,
       count(*) filter (where should_snapshot and evidence->>'phase1_snapshot' = 'true')::bigint as already_snapshot_candidates,
       count(*) filter (where should_snapshot and evidence->>'phase1_snapshot' is distinct from 'true')::bigint as pending_snapshot_candidates
     from candidate_flags`,
  );
  return {
    nonEnumValueCandidates: Number(result?.non_enum_value_candidates ?? 0),
    textValueCandidates: Number(result?.text_value_candidates ?? 0),
    documentInfoSuspectedPollution: Number(result?.document_info_suspected_pollution ?? 0),
    snapshotUnionCandidates: Number(result?.snapshot_union_candidates ?? 0),
    alreadySnapshotCandidates: Number(result?.already_snapshot_candidates ?? 0),
    pendingSnapshotCandidates: Number(result?.pending_snapshot_candidates ?? 0),
  };
}

function snapshotUpdateSql() {
  return `with candidate_flags as (${snapshotCandidateFlagsSql()}),
     updated as (
       update agent.dictionary_candidates c
       set
         evidence = jsonb_set(
           jsonb_set(coalesce(c.evidence, '{}'::jsonb), '{phase1_snapshot}', 'true'::jsonb, true),
           '{phase1_snapshot_reason}',
           to_jsonb(array_remove(array[
             case when f.is_non_enum_value then 'non_enum_value_candidate' end,
             case when f.is_text_value then 'text_value_candidate' end,
             case when f.is_document_info_suspected_pollution then 'document_info_suspected_pollution' end
           ], null)),
           true
         ),
         updated_at = now()
       from candidate_flags f
       where c.id = f.id
         and f.should_snapshot
         and coalesce(c.evidence, '{}'::jsonb)->>'phase1_snapshot' is distinct from 'true'
       returning c.id
     )
     select count(*)::bigint as updated_count from updated`;
}

function snapshotCandidateFlagsSql() {
  return `select
       c.id,
       coalesce(c.evidence, '{}'::jsonb) as evidence,
       candidate_type = 'value' and coalesce(t.value_kind, 'text') not in ('enum', 'enums') as is_non_enum_value,
       candidate_type = 'value' and coalesce(t.value_kind, 'text') = 'text' as is_text_value,
       candidate_type = 'value'
         and concat_ws(' ', c.term_type, c.raw_value, c.evidence->>'firstFieldPath', c.evidence::text) ~* '${DOCUMENT_INFO_PATTERN}' as is_document_info_suspected_pollution,
       (
         candidate_type = 'value'
         and (
           coalesce(t.value_kind, 'text') not in ('enum', 'enums')
           or coalesce(t.value_kind, 'text') = 'text'
           or concat_ws(' ', c.term_type, c.raw_value, c.evidence->>'firstFieldPath', c.evidence::text) ~* '${DOCUMENT_INFO_PATTERN}'
         )
       ) as should_snapshot
     from (
       select
         c.*,
         coalesce(c.evidence->>'candidateType',
           case
             when c.term_type = 'unit' or c.term_type like '%\\_unit' then 'unit'
             when c.term_type in ('field', 'term_type') or c.term_type like 'unknown\\_field%' then 'term_type'
             else 'value'
           end
         ) as candidate_type
       from agent.dictionary_candidates c
     ) c
     left join agent.dictionary_term_types t on t.term_type = c.term_type`;
}

function summarizeOccurrenceCounts(rows: Array<{ candidate_id: bigint; occurrence_count: bigint }>) {
  const counts = rows.map((row) => Number(row.occurrence_count));
  return {
    groupedCandidateCountSample: rows.length,
    maxOccurrenceCountInTop20: counts[0] ?? 0,
    top20: rows.map((row) => ({
      candidateId: String(row.candidate_id),
      occurrenceCount: Number(row.occurrence_count),
    })),
  };
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
