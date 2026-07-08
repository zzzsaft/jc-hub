import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: "/Users/zzzsaft/Documents/jc-hub/.env" });

const prisma = new PrismaClient();
const mode = process.argv.includes("--apply") ? "apply" : "plan";
const runId = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = path.resolve("tmp", `duplicate-archive-cleanup-${runId}`);

const duplicateWhereSql = `
  select document_id
  from agent.contract_archives
  where document_id is not null
  group by document_id
  having count(*) > 1
`;

const rankedSql = `
  with ranked as (
    select
      a.*,
      row_number() over (
        partition by a.document_id
        order by
          case when a.status = 'archived' and a.dirty_reason is null then 0 else 1 end,
          a.updated_at desc,
          a.id asc
      ) as keep_rank
    from agent.contract_archives a
    where a.document_id in (${duplicateWhereSql})
  )
  select
    id::text,
    document_id::text,
    archive_key,
    status,
    dirty_reason,
    extraction_result_id::text,
    version,
    created_at,
    updated_at,
    keep_rank
  from ranked
  order by document_id::bigint, keep_rank, id
`;

const duplicateIdsSql = `
  with ranked as (
    select
      id,
      row_number() over (
        partition by document_id
        order by
          case when status = 'archived' and dirty_reason is null then 0 else 1 end,
          updated_at desc,
          id asc
      ) as keep_rank
    from agent.contract_archives
    where document_id in (${duplicateWhereSql})
  )
  select id from ranked where keep_rank > 1
`;

async function query(sql) {
  return prisma.$queryRawUnsafe(sql);
}

async function writeJson(name, data) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, name), JSON.stringify(data, bigintJson, 2));
}

function bigintJson(_key, value) {
  return typeof value === "bigint" ? value.toString() : value;
}

async function main() {
  const before = {
    summary: await query(`
      with dup as (${duplicateWhereSql}),
      rows as (select a.* from agent.contract_archives a join dup d using(document_id))
      select
        count(distinct document_id)::int as duplicate_document_count,
        count(*)::int as duplicate_archive_row_count,
        count(*) - count(distinct document_id)::int as rows_to_remove,
        count(*) filter (where dirty_reason is null)::int as null_dirty_count,
        count(*) filter (where dirty_reason = 'duplicate_archive_not_refreshed')::int as marked_duplicate_count,
        count(*) filter (where status = 'archived')::int as archived_count
      from rows
    `),
    dirtyReasons: await query(`
      with dup as (${duplicateWhereSql})
      select coalesce(dirty_reason, '[null]') as dirty_reason, status, count(*)::int as count
      from agent.contract_archives a join dup d using(document_id)
      group by dirty_reason, status
      order by count desc
    `),
    rankedArchives: await query(rankedSql),
    childCounts: await query(`
      with ids as (${duplicateIdsSql})
      select
        (select count(*)::int from ids) as archive_count,
        (select count(*)::int from agent.contract_archive_items where archive_id in (select id from ids)) as item_count,
        (select count(*)::int from agent.contract_archive_item_products where archive_id in (select id from ids)) as item_product_count,
        (select count(*)::int from agent.contract_archive_versions where archive_id in (select id from ids)) as version_count
    `),
    existingIndexes: await query(`
      select schemaname, tablename, indexname, indexdef
      from pg_indexes
      where tablename = 'contract_archives'
        and indexdef ilike '%document_id%'
      order by schemaname, indexname
    `),
  };
  await writeJson("before.json", before);

  if (mode === "plan") {
    console.log(JSON.stringify({ mode, outDir, before: { summary: before.summary, dirtyReasons: before.dirtyReasons, childCounts: before.childCounts, existingIndexes: before.existingIndexes } }, bigintJson, 2));
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`
      delete from agent.contract_archive_item_products
      where archive_id in (${duplicateIdsSql})
    `);
    await tx.$executeRawUnsafe(`
      delete from agent.contract_archive_versions
      where archive_id in (${duplicateIdsSql})
    `);
    await tx.$executeRawUnsafe(`
      delete from agent.contract_archive_items
      where archive_id in (${duplicateIdsSql})
    `);
    await tx.$executeRawUnsafe(`
      delete from agent.contract_archives
      where id in (${duplicateIdsSql})
    `);
  }, { timeout: 120_000 });

  await prisma.$executeRawUnsafe(`
    create unique index concurrently if not exists contract_archives_document_id_unique_not_null
    on production_config_agent.contract_archives (document_id)
    where document_id is not null
  `);

  const after = {
    duplicateGroups: await query(`
      select document_id::text, count(*)::int as count
      from agent.contract_archives
      where document_id is not null
      group by document_id
      having count(*) > 1
      order by document_id::bigint
    `),
    indexes: await query(`
      select schemaname, tablename, indexname, indexdef
      from pg_indexes
      where tablename = 'contract_archives'
        and indexname = 'contract_archives_document_id_unique_not_null'
    `),
  };
  await writeJson("after.json", after);
  console.log(JSON.stringify({ mode, outDir, after }, bigintJson, 2));
}

main().finally(async () => {
  await prisma.$disconnect();
});
