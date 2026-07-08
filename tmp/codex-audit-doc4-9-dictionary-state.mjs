import fs from "node:fs";
import dotenv from "dotenv";

process.env.CODEX_SANDBOX_NETWORK_DISABLED = "0";
dotenv.config({ path: "/Users/zzzsaft/Documents/jc-hub/.env" });

const { prisma } = await import("../apps/server/build/lib/prisma.js");

const candidateIds = [3, 7, 9, 11, 17, 28, 47, 49, 679, 218, 219, 220, 683, 3856, 3857, 106, 107, 5, 13, 20, 24, 29, 33, 34, 36, 40, 42, 44, 45, 46, 253, 270, 271, 274, 306, 315, 397, 396];
const candidates = await prisma.dictionaryCandidate.findMany({
  where: { id: { in: candidateIds.map(BigInt) } },
  select: { id: true, termType: true, rawValue: true, status: true, proposedCanonicalValue: true, reviewedBy: true, reviewedAt: true },
  orderBy: { id: "asc" },
});
const aliases = await prisma.dictionaryAlias.findMany({
  where: { aliasValue: { in: candidates.map((item) => item.rawValue) } },
  select: { id: true, termType: true, aliasValue: true, normalizedAlias: true, termId: true, source: true, isActive: true },
  orderBy: [{ termType: "asc" }, { aliasValue: "asc" }],
});
const terms = await prisma.dictionaryTerm.findMany({
  where: { id: { in: aliases.map((item) => item.termId) } },
  select: { id: true, termType: true, canonicalValue: true, isActive: true },
  orderBy: [{ termType: "asc" }, { canonicalValue: "asc" }],
});
const splitColumns = await prisma.$queryRaw`
  select column_name, is_nullable
  from information_schema.columns
  where table_schema = 'production_config_agent' and table_name = 'dictionary_splits'
  order by ordinal_position
`;
const changeLogColumns = await prisma.$queryRaw`
  select column_name, is_nullable
  from information_schema.columns
  where table_schema = 'production_config_agent' and table_name = 'dictionary_change_logs'
  order by ordinal_position
`;
const splitConstraints = await prisma.$queryRaw`
  select conname, contype
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'production_config_agent' and t.relname = 'dictionary_splits'
  order by conname
`;
const report = { candidates, aliases, terms, splitColumns, changeLogColumns, splitConstraints };
fs.writeFileSync("tmp/codex-doc4-9-dictionary-state-audit.json", JSON.stringify(report, (_, value) => typeof value === "bigint" ? value.toString() : value, 2));
console.log(JSON.stringify(report, (_, value) => typeof value === "bigint" ? value.toString() : value, 2));
await prisma.$disconnect();
