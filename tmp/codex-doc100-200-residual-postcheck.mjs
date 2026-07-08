import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

process.env.CODEX_SANDBOX_NETWORK_DISABLED = "0";
dotenv.config({ path: "/Users/zzzsaft/Documents/jc-hub/.env" });

const prisma = new PrismaClient();
const json = (value) => JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item), 2);

try {
  const latest = await prisma.$queryRawUnsafe(`
    select min(er.id)::text as min_id, max(er.id)::text as max_id, count(*)::int as count
    from production_config_agent.extraction_results er
    where er.document_id between 100 and 200 and er.id > 25986
  `);
  const sampleLatest = await prisma.$queryRawUnsafe(`
    with latest as (
      select distinct on (document_id) document_id::int as document_id, id::text as extraction_result_id
      from production_config_agent.extraction_results
      where document_id between 100 and 200
      order by document_id, created_at desc, id desc
    )
    select * from (
      (select * from latest order by document_id asc limit 3)
      union all
      (select * from latest order by document_id desc limit 3)
    ) t order by document_id
  `);
  const dirtyDocs = await prisma.$queryRawUnsafe(`
    select id::int, dictionary_dirty
    from production_config_agent.documents
    where id between 100 and 200 and dictionary_dirty = true
    order by id
  `);
  const dirtyArchives = await prisma.$queryRawUnsafe(`
    select id::text, document_id::int, dirty_reason
    from production_config_agent.contract_archives
    where document_id between 100 and 200 and dirty_reason is not null
    order by document_id
  `);
  const pendingCandidates = await prisma.$queryRawUnsafe(`
    select id::text, document_id::int, term_type, raw_value, status
    from production_config_agent.dictionary_candidates
    where document_id between 100 and 200 and status = 'pending'
    order by document_id, id
  `);
  const archiveItemCount = await prisma.$queryRawUnsafe(`
    select count(*)::int as count
    from production_config_agent.contract_archive_items
    where document_id between 100 and 200
  `);
  const duplicateArchives = await prisma.$queryRawUnsafe(`
    select document_id::int, count(*)::int as count
    from production_config_agent.contract_archives
    where document_id is not null
    group by document_id
    having count(*) > 1
    order by document_id
  `);
  const uniqueIndex = await prisma.$queryRawUnsafe(`
    select indexname
    from pg_indexes
    where schemaname = 'production_config_agent'
      and tablename = 'contract_archives'
      and indexname = 'contract_archives_document_id_unique_not_null'
  `);
  const llmRecent = await prisma.llmCallLog.count({ where: { createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) } } }).catch(() => null);
  console.log(json({
    latest,
    sampleLatest,
    dirtyDocs,
    dirtyArchives,
    pendingCandidates,
    archiveItemCount,
    duplicateArchiveCount: duplicateArchives.length,
    duplicateArchives,
    uniqueIndexPresent: uniqueIndex.length === 1,
    llmCallsLast30Minutes: llmRecent,
    businessLlmTokens: 0,
  }));
} finally {
  await prisma.$disconnect();
}
