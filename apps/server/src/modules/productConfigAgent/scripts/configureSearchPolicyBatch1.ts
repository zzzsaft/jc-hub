import { pathToFileURL } from "node:url";
import { Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";
import { getLegacyArchiveSearchFieldConfig } from "../archive/insertGate.js";
import {
  buildSearchPolicyDiagnostics,
  buildTermTypeSearchPolicy,
  loadTermTypeSearchPolicy,
  type SearchPolicySpace,
  type SearchPolicyTier,
  type TermTypeSearchPolicyRow,
} from "../archive/searchPolicy.js";

export type SearchPolicyBatch1Entry = {
  termType: string;
  tier: SearchPolicyTier;
  spaces: SearchPolicySpace[];
};

export type SearchPolicyBatch1UpdatePlan = {
  termType: string;
  id: string;
  beforeMetadata: Record<string, unknown>;
  afterMetadata: Record<string, unknown>;
  searchPolicy: Pick<SearchPolicyBatch1Entry, "tier" | "spaces">;
};

export type SearchPolicyBatch1Plan = {
  updated: SearchPolicyBatch1UpdatePlan[];
  skipped: string[];
  missing: string[];
};

export const SEARCH_POLICY_BATCH1: SearchPolicyBatch1Entry[] = [
  ...["product_type", "application", "plastic_material"].map((termType) => ({
    termType,
    tier: "primary" as const,
    spaces: ["similarity", "keyword", "quote", "context"] as SearchPolicySpace[],
  })),
  ...[
    "product_effective_width",
    "die_effective_width",
    "die_width",
    "product_effective_thickness",
    "layer_count",
    "heating_zone_count",
    "lip_adjustment_method",
    "deckle_type",
  ].map((termType) => ({
    termType,
    tier: "secondary" as const,
    spaces: ["similarity", "keyword", "quote", "context"] as SearchPolicySpace[],
  })),
  ...["filter_model", "metering_pump_model"].map((termType) => ({
    termType,
    tier: "tertiary" as const,
    spaces: ["keyword", "quote", "context"] as SearchPolicySpace[],
  })),
  ...["deckle_note", "drawing_note", "manual_requirement", "surface_treatment_note"].map((termType) => ({
    termType,
    tier: "context" as const,
    spaces: ["context"] as SearchPolicySpace[],
  })),
];

export function planSearchPolicyBatch1Updates(rows: TermTypeSearchPolicyRow[]): SearchPolicyBatch1Plan {
  const rowsByTermType = new Map<string, TermTypeSearchPolicyRow & { id?: unknown }>();
  for (const row of rows as Array<TermTypeSearchPolicyRow & { id?: unknown }>) {
    const termType = String(row.termType ?? row.term_type ?? "").trim();
    const active = row.isActive ?? row.is_active ?? true;
    if (!termType || !active) continue;
    rowsByTermType.set(termType, row);
  }

  const updated: SearchPolicyBatch1UpdatePlan[] = [];
  const skipped: string[] = [];
  const missing: string[] = [];
  for (const entry of SEARCH_POLICY_BATCH1) {
    const row = rowsByTermType.get(entry.termType);
    if (!row) {
      missing.push(entry.termType);
      continue;
    }
    const beforeMetadata = objectRecord(row.metadata);
    const searchPolicy = { tier: entry.tier, spaces: [...entry.spaces] };
    if (sameSearchPolicy(objectRecord(beforeMetadata.searchPolicy), searchPolicy)) {
      skipped.push(entry.termType);
      continue;
    }
    updated.push({
      termType: entry.termType,
      id: String(row.id ?? ""),
      beforeMetadata,
      afterMetadata: { ...beforeMetadata, searchPolicy },
      searchPolicy,
    });
  }

  return {
    updated: updated.sort((left, right) => left.termType.localeCompare(right.termType)),
    skipped: skipped.sort(),
    missing: missing.sort(),
  };
}

export async function applySearchPolicyBatch1() {
  const beforePolicy = await loadTermTypeSearchPolicy();
  const rows = await (prisma.dictionaryTermType as any).findMany({
    where: { isActive: true },
    select: { id: true, termType: true, metadata: true, isActive: true },
    orderBy: { termType: "asc" },
  });
  const plan = planSearchPolicyBatch1Updates(rows);

  for (const update of plan.updated) {
    await prisma.dictionaryTermType.update({
      where: { id: BigInt(update.id) },
      data: { metadata: update.afterMetadata as Prisma.InputJsonObject },
    });
  }

  const afterRows = await (prisma.dictionaryTermType as any).findMany({
    where: { isActive: true },
    select: { termType: true, metadata: true, isActive: true },
    orderBy: { termType: "asc" },
  });
  const afterPolicy = buildTermTypeSearchPolicy(afterRows);
  const legacyConfig = getLegacyArchiveSearchFieldConfig();
  return {
    updated: plan.updated.map((item) => item.termType),
    skipped: plan.skipped,
    missing: plan.missing,
    beforeDiagnostics: buildSearchPolicyDiagnostics(beforePolicy, legacyConfig),
    afterDiagnostics: buildSearchPolicyDiagnostics(afterPolicy, legacyConfig),
  };
}

async function main() {
  const result = await applySearchPolicyBatch1();
  console.log(JSON.stringify(result, null, 2));
}

function sameSearchPolicy(
  left: Record<string, unknown>,
  right: Pick<SearchPolicyBatch1Entry, "tier" | "spaces">,
): boolean {
  return left.tier === right.tier
    && Array.isArray(left.spaces)
    && JSON.stringify(left.spaces) === JSON.stringify(right.spaces);
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function isDirectRun() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isDirectRun()) {
  main()
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
