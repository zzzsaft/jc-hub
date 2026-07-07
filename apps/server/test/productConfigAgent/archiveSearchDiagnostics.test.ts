import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAliasGapAudit,
  buildAliasGapAliasApplyPlan,
  buildCandidatePoolTruncationDiagnostics,
  type AliasDictionaryValue,
} from "../../src/modules/productConfigAgent/archive/archiveSearchDiagnostics.js";
import type { ArchiveItemSearchResult } from "../../src/modules/productConfigAgent/archive/archiveItemSearch.service.js";

test("alias gap audit reports missing wave-board alias against existing application terms", () => {
  const dictionaryValues: AliasDictionaryValue[] = [
    {
      termId: "1",
      termType: "application",
      canonicalValue: "波浪瓦板",
      displayName: "波浪瓦板",
      aliases: ["波浪瓦"],
    },
  ];

  const audit = buildAliasGapAudit({
    termType: "application",
    queryTerms: ["波浪板", "波浪瓦", "波浪瓦板"],
    dictionaryValues,
    occurrences: [
      { archiveItemId: "452", archiveId: "228", itemName: "1380mm PVC+UPVC波浪板模头", matchedValue: "波浪板", source: "itemName" },
      { archiveItemId: "747", archiveId: "350", itemName: "1300mmPVC波浪瓦板模头", matchedValue: "波浪瓦板", source: "itemName" },
    ],
  });

  const missing = audit.suggestions.find((item) => item.queryTerm === "波浪板" && item.canonicalValue === "波浪瓦板");
  assert.equal(missing?.termId, "1");
  assert.equal(missing?.status, "missing_alias");
  assert.ok((missing?.confidence ?? 0) >= 0.75);
  assert.deepEqual(missing?.evidence.sharedCharacters, ["波", "浪", "板"]);

  const covered = audit.suggestions.find((item) => item.queryTerm === "波浪瓦" && item.canonicalValue === "波浪瓦板");
  assert.equal(covered?.status, "already_covered");
  assert.equal(covered?.confidence, 1);
});

test("alias gap apply plan includes only high-confidence missing aliases", () => {
  const audit = buildAliasGapAudit({
    termType: "application",
    queryTerms: ["波浪板", "波浪瓦板"],
    dictionaryValues: [
      {
        termId: "1",
        termType: "application",
        canonicalValue: "波浪瓦板",
        displayName: "波浪瓦板",
        aliases: ["波浪瓦板"],
      },
    ],
    occurrences: [
      { archiveItemId: "452", archiveId: "228", itemName: "1380mm PVC+UPVC波浪板模头", matchedValue: "波浪板", source: "itemName" },
      { archiveItemId: "747", archiveId: "350", itemName: "1300mmPVC波浪瓦板模头", matchedValue: "波浪瓦板", source: "itemName" },
    ],
  });

  const plan = buildAliasGapAliasApplyPlan(audit, { minConfidence: 0.7 });

  assert.equal(plan.mode, "dry-run");
  assert.deepEqual(
    plan.proposals.map((proposal) => ({
      termId: proposal.termId,
      termType: proposal.termType,
      canonicalValue: proposal.canonicalValue,
      aliasValue: proposal.aliasValue,
      normalizedAlias: proposal.normalizedAlias,
      source: proposal.source,
    })),
    [
      {
        termId: "1",
        termType: "application",
        canonicalValue: "波浪瓦板",
        aliasValue: "波浪板",
        normalizedAlias: "波浪板",
        source: "archive_search_alias_gap_audit",
      },
    ],
  );
});

test("candidate pool diagnostics flags precise expanded results excluded from default pool", () => {
  const defaultResults = [
    result("642", "1320mm PVC仿结皮发泡板模头", 0.544, [
      "关键词命中：PVC, 模头",
      "产品类型匹配：flat_die",
      "材料匹配：PVC",
      "宽度接近：目标 1380mm，历史 1320mm，差值 60mm",
    ]),
  ];
  const expandedResults = [
    result("452", "1380mm PVC+UPVC波浪板模头", 0.76, [
      "关键词命中：1380mm, 1380, PVC, UPVC, 波浪板模头, 波浪板, 模头",
      "产品类型匹配：flat_die",
      "材料匹配：PVC",
      "宽度接近：目标 1380mm，历史 1380mm，差值 0mm",
    ]),
    ...defaultResults,
  ];

  const diagnostics = buildCandidatePoolTruncationDiagnostics({
    queryText: "1380mm PVC+UPVC 波浪板模头",
    productType: "flat_die",
    materials: ["PVC", "UPVC"],
    application: "波浪板",
    widthMm: 1380,
    defaultLimit: 10,
    expandedLimit: 50,
    defaultResults,
    expandedResults,
  });

  assert.equal(diagnostics.query.defaultCandidateLimit, 250);
  assert.equal(diagnostics.query.expandedCandidateLimit, 1000);
  assert.equal(diagnostics.truncatedHighScoringResults[0].archiveItemId, "452");
  assert.equal(diagnostics.preciseItemsExcludedFromDefault[0].archiveItemId, "452");
});

function result(archiveItemId: string, itemName: string, similarityScore: number, matchReasons: string[]): ArchiveItemSearchResult {
  return {
    archiveItemId,
    archiveId: "1",
    documentId: null,
    itemName,
    productType: "flat_die",
    similarityScore,
    matchReasons,
    confirmedFields: {},
    unresolvedFieldsSummary: [],
    agentReadiness: {},
    searchableTextSummary: null,
    evidence: { archiveId: "1" },
  };
}
