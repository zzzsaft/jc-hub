import "../../../config/env.js";
import path from "node:path";
import { prisma } from "../../../lib/prisma.js";
import { parseExcelFile } from "../excelParser/index.js";
import { productConfigAgentService } from "../service.js";
import { productConfigAgentRepository } from "../db.service.js";

const args = process.argv.slice(2);
const limit = getNumberArg("--limit=", 5);
const skip = getNumberArg("--skip=", 0);
const llmModel = getStringArg("--llm-model=", process.env.INFERAI_MODEL ?? "inferaichat:deepseek-v4-flash");
const documentStatus = args.includes("--only-with-existing-extractions") ? "normalized" : undefined;
const parserVersion = "v2";

type ReparseRunSummary = {
  totalDocuments: number;
  plannedDocumentLimit: number;
  successCount: number;
  failedCount: number;
  defaultModel: string;
  runs: ReparseDocumentRun[];
};

type CandidatePrecheck = {
  termType: string;
  count: number;
  sampleValues: string[];
  reason: "not-in-active-dictionary";
  preliminaryDecision: "requires-review";
  onlineSearchHint: string;
};

type ReparseDocumentRun = {
  documentId: number;
  filePath: string;
  fileName: string | null;
  status: "ok" | "failed";
  source: string;
  parse: {
    usedExistingDocument: boolean;
    previousHasBlocks: boolean;
    parsedBlocksChanged: boolean;
    previousBlockSignature: string | null;
    currentBlockSignature: string;
  };
  extraction: {
    usedDocumentId: number;
    modelUsed: string | null;
    previousExtractionId: number | null;
    newExtractionId: number;
    rawExtractionChanged: boolean;
    normalizedExtractionChanged: boolean;
  };
  candidate: {
    beforeCount: number;
    afterCount: number;
    added: number;
    removed: number;
    candidateDelta: {
      added: string[];
      removed: string[];
      unchanged: string[];
    };
    refreshResult: {
      scannedExtractions: number;
      createdOrUpdated: number;
    };
    termTypePrechecks: CandidatePrecheck[];
  };
  error?: string;
};

const validStatuses = documentStatus ? [documentStatus] : undefined;

const documents = await prisma.productDocument.findMany({
  where: {
    ...(validStatuses ? { status: { in: validStatuses } } : {}),
    OR: [{ filePath: { endsWith: ".xlsx" } }, { filePath: { endsWith: ".xls" } }],
  },
  orderBy: { id: "asc" },
  skip,
  take: limit,
});

const [activeTermTypeRows, termTypeAliasRows] = await Promise.all([
  prisma.dictionaryTermType.findMany({
    where: { isActive: true },
    select: { termType: true },
  }),
  prisma.dictionaryTermTypeAlias.findMany({
    where: { isActive: true },
    select: { normalizedAlias: true, termType: true },
  }),
]);

const activeTermTypeSet = new Set(activeTermTypeRows.map((row) => String(row.termType)));
const termTypeAliasSet = new Set(
  termTypeAliasRows.map((row) => String(row.normalizedAlias).toLowerCase()),
);

const runs: ReparseDocumentRun[] = [];
let successCount = 0;
let failedCount = 0;

for (const document of documents) {
  const fileName = document.fileName ?? null;
  const documentId = Number(document.id);
  const run: ReparseDocumentRun = {
    documentId,
    filePath: document.filePath,
    fileName,
    status: "ok",
    source: "reparse-excel-configs-and-compare-script",
    parse: {
      usedExistingDocument: false,
      previousHasBlocks: false,
      parsedBlocksChanged: false,
      previousBlockSignature: null,
      currentBlockSignature: "",
    },
    extraction: {
      usedDocumentId: documentId,
      modelUsed: llmModel,
      previousExtractionId: null,
      newExtractionId: 0,
      rawExtractionChanged: false,
      normalizedExtractionChanged: false,
    },
    candidate: {
      beforeCount: 0,
      afterCount: 0,
      added: 0,
      removed: 0,
      candidateDelta: {
        added: [],
        removed: [],
        unchanged: [],
      },
      refreshResult: {
        scannedExtractions: 0,
        createdOrUpdated: 0,
      },
      termTypePrechecks: [],
    },
  };
  runs.push(run);

  try {
    const previousBlocks = await prisma.documentBlock.findUnique({
      where: { documentId: document.id },
    });
    const previousExtraction = await prisma.extractionResult.findFirst({
      where: { documentId: document.id },
      orderBy: { createdAt: "desc" },
    });
    const previousCandidates = previousExtraction
      ? await prisma.dictionaryCandidate.findMany({
          where: { extractionResultId: previousExtraction.id },
          select: { termType: true, rawValue: true, status: true },
        })
      : [];

    run.parse.previousHasBlocks = Boolean(previousBlocks);
    run.parse.previousBlockSignature = previousBlocks ? stableJsonStringify(previousBlocks.blocksJson) : null;
    run.extraction.previousExtractionId = previousExtraction ? Number(previousExtraction.id) : null;
    run.candidate.beforeCount = previousCandidates.length;

    const parsed = await parseAndPersistBlocksByDocumentId({
      documentId,
      filePath: document.filePath,
      fileName: fileName ?? path.basename(document.filePath),
      source: run.source,
    });
    run.parse.usedExistingDocument = false;
    run.parse.currentBlockSignature = stableJsonStringify(parsed.blocksJson);
    run.parse.parsedBlocksChanged = run.parse.previousBlockSignature !== run.parse.currentBlockSignature;

    const extracted = await productConfigAgentService.extractDocument({
      documentId: parsed.document.id,
      llmModel,
      force: true,
    });
    run.extraction.newExtractionId = Number(extracted.extraction.id);
    run.extraction.modelUsed = extracted.extraction.llmModel ?? llmModel ?? null;
    const newExtraction = extracted.extraction;

    if (previousExtraction) {
      run.extraction.rawExtractionChanged = stableJsonStringify(previousExtraction.extractionJson) !== stableJsonStringify(newExtraction.extractionJson);
      run.extraction.normalizedExtractionChanged =
        stableJsonStringify(previousExtraction.normalizedExtractionJson) !== stableJsonStringify(newExtraction.normalizedExtractionJson);
    } else {
      run.extraction.rawExtractionChanged = true;
      run.extraction.normalizedExtractionChanged = true;
    }

    run.candidate.refreshResult = await productConfigAgentRepository.refreshDictionaryCandidates({
      documentId: Number(document.id),
      source: "reparse-script",
    });

    const newCandidates = await prisma.dictionaryCandidate.findMany({
      where: { extractionResultId: newExtraction.id },
      select: { termType: true, rawValue: true, status: true },
      orderBy: [{ termType: "asc" }, { rawValue: "asc" }],
    });
    run.candidate.afterCount = newCandidates.length;

    const previousSet = new Set(previousCandidates.map((candidate) => normalizeCandidateSignature(candidate)));
    const nextSet = new Set(newCandidates.map((candidate) => normalizeCandidateSignature(candidate)));
    run.candidate.candidateDelta = diffStringSets(previousSet, nextSet);
    run.candidate.added = run.candidate.candidateDelta.added.length;
    run.candidate.removed = run.candidate.candidateDelta.removed.length;

    run.candidate.termTypePrechecks = buildTermTypePrechecks(newCandidates, activeTermTypeSet, termTypeAliasSet);
    successCount += 1;
  } catch (error) {
    run.status = "failed";
    run.error = error instanceof Error ? error.message : String(error);
    failedCount += 1;
  }
}

const summary: ReparseRunSummary = {
  totalDocuments: documents.length,
  plannedDocumentLimit: limit,
  successCount,
  failedCount,
  defaultModel: llmModel,
  runs,
};

console.log(JSON.stringify(summary, null, 2));
if (failedCount > 0) process.exitCode = 1;

await prisma.$disconnect();

function stableJsonStringify(value: unknown): string {
  return stableStringify(value, new Set());
}

function stableStringify(value: unknown, visited: Set<unknown>): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value !== "object") return String(value);
  if (visited.has(value)) return "\"[Circular]\"";
  visited.add(value);
  if (Array.isArray(value)) {
    const valueJson = value.map((item) => stableStringify(item, visited));
    return `[${valueJson.join(",")}]`;
  }
  const object = value as Record<string, unknown>;
  const keys = Object.keys(object).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(object[key], visited)}`).join(",")}}`;
}

function normalizeCandidateSignature(candidate: { termType: string; rawValue: string; status: string }) {
  return `${candidate.termType}\u0000${normalizeText(candidate.rawValue)}\u0000${candidate.status}`;
}

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function diffStringSets(previous: Set<string>, next: Set<string>) {
  const unchanged: string[] = [];
  const added: string[] = [];
  const removed: string[] = [];
  for (const key of previous) {
    if (next.has(key)) unchanged.push(key);
    else removed.push(key);
  }
  for (const key of next) {
    if (!previous.has(key)) added.push(key);
  }
  return { unchanged, added, removed };
}

function buildTermTypePrechecks(
  candidates: Array<{ termType: string; rawValue: string }>,
  activeTermTypes: Set<string>,
  termTypeAliasSet: Set<string>,
) {
  const grouped = new Map<string, { termType: string; count: number; values: string[] }>();
  for (const candidate of candidates) {
    const termType = String(candidate.termType).trim();
    if (!termType) continue;
    if (activeTermTypes.has(termType)) continue;
    if (termTypeAliasSet.has(termType.toLowerCase())) continue;
    const record = grouped.get(termType);
    if (!record) {
      grouped.set(termType, { termType, count: 1, values: [candidate.rawValue] });
    } else {
      record.count += 1;
      if (record.values.length < 5) record.values.push(candidate.rawValue);
    }
  }
  return [...grouped.values()].map((item) => ({
    termType: item.termType,
    count: item.count,
    sampleValues: item.values,
    reason: "not-in-active-dictionary" as const,
    preliminaryDecision: "requires-review" as const,
    onlineSearchHint: `https://duckduckgo.com/?q=${encodeURIComponent(`${item.termType} 配置项 含义`)}`,
  }));
}

function getStringArg(prefix: string, fallback: string) {
  const arg = args.find((value) => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
}

function getNumberArg(prefix: string, fallback: number) {
  const arg = args.find((value) => value.startsWith(prefix));
  if (!arg) return fallback;
  const parsed = Number(arg.slice(prefix.length));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function parseAndPersistBlocksByDocumentId(params: {
  documentId: number;
  filePath: string;
  fileName: string;
  source: string;
}) {
  const parsed = await parseExcelFile({
    filePath: params.filePath,
    fileName: params.fileName,
    sourceType: "local",
    options: { includeRowBlocks: false, buildLlmText: true },
  });
  if (!parsed.success) {
    throw Object.assign(new Error(parsed.error.message), {
      stage: "productConfigAgent:parseBlocks",
      errorCode: parsed.error.code,
    });
  }
  const blocks = await productConfigAgentRepository.upsertBlocks({
    documentId: params.documentId,
    blocksJson: parsed.data,
    parserVersion,
  });
  await productConfigAgentRepository.updateDocumentStatus(params.documentId, "parsed");
  return blocks;
}
