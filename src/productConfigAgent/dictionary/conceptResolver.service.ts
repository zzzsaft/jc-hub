import { prisma } from "../../lib/prisma.js";
import { conceptIssueDetectorService } from "./conceptIssueDetector.service.js";
import { normalizeNumberUnit } from "./numberUnit.js";
import { resolverRoutingService } from "./resolverRouting.service.js";

export class ConceptResolverService {
  async runResolver(params?: {
    conceptType?: string;
    sourceValue?: string;
    dryRun?: boolean;
    limit?: number;
  }) {
    const run = await createConceptResolverRun({
      status: "running",
      mode: params?.dryRun === false ? "apply" : "dry_run",
      input: params ?? {},
    });
    const candidates = await prisma.dictionaryCandidate.findMany({
      where: {
        status: "pending",
        ...(params?.sourceValue ? { rawValue: { contains: params.sourceValue, mode: "insensitive" } } : {}),
      },
      orderBy: [{ confidence: "desc" }, { updatedAt: "desc" }],
      take: Math.min(200, Math.max(1, params?.limit ?? 50)),
    });
    const entries = [];
    for (const candidate of candidates) {
      const resolution = inferResolution(adaptCandidate(candidate));
      for (const issue of resolution.issues) {
        await upsertPatternReview({
          conceptType: params?.conceptType ?? candidate.termType,
          sourceValue: candidate.rawValue,
          issue,
          runId: run.id,
        });
      }
      const entry = await prisma.conceptResolverEntry.upsert({
        where: {
          conceptType_sourceValue: {
            conceptType: params?.conceptType ?? candidate.termType,
            sourceValue: candidate.rawValue,
          },
        },
        create: {
          conceptType: params?.conceptType ?? candidate.termType,
          sourceValue: candidate.rawValue,
          resolvedValue: resolution.resolvedValue,
          confidence: resolution.confidence,
          status: resolution.status,
          resolverVersion: "prisma-v1",
          metadata: toJson({
            candidateId: Number(candidate.id),
            runId: run.id,
            issues: resolution.issues,
            routing: resolution.routing,
            numberUnit: resolution.numberUnit,
          }),
        },
        update: {
          resolvedValue: resolution.resolvedValue,
          confidence: resolution.confidence,
          status: resolution.status,
          resolverVersion: "prisma-v1",
          metadata: toJson({
            candidateId: Number(candidate.id),
            runId: run.id,
            issues: resolution.issues,
            routing: resolution.routing,
            numberUnit: resolution.numberUnit,
          }),
        },
      });
      entries.push(entry);
    }
    await finishConceptResolverRun(run.id, {
      status: "completed",
      result: { scanned: candidates.length, resolved: entries.length },
    });
    return { run: { ...run, status: "completed" }, entries: mapBigInts(entries) };
  }

  async getRun(runId: string | number) {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `select * from agent.concept_resolver_runs where id = $1::bigint`,
      String(runId),
    );
    return rows[0] ? mapBigInts(rows[0]) : null;
  }

  async listResolutions(params?: { conceptType?: string; status?: string }) {
    return mapBigInts(
      await prisma.conceptResolverEntry.findMany({
        where: {
          ...(params?.conceptType ? { conceptType: params.conceptType } : {}),
          ...(params?.status ? { status: params.status } : {}),
        },
        orderBy: [{ status: "asc" }, { confidence: "desc" }],
      }),
    );
  }

  async listPatterns(params?: { status?: string }) {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `select * from agent.concept_pattern_reviews
       where ($1::text is null or status = $1::text)
       order by updated_at desc`,
      params?.status ?? null,
    );
    return mapBigInts(rows);
  }

  async reviewPattern(params: { id: string | number; status: string; reviewedBy?: string | null; note?: string }) {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `update agent.concept_pattern_reviews
       set status = $2, reviewed_by = $3, note = $4, updated_at = now()
       where id = $1::bigint returning *`,
      String(params.id),
      params.status,
      params.reviewedBy ?? null,
      params.note ?? null,
    );
    if (!rows[0]) throw new Error(`Concept pattern not found: ${params.id}`);
    return mapBigInts(rows[0]);
  }

  async applyPatternCandidates(params: { id: string | number; reviewedBy?: string | null }) {
    const pattern = await this.reviewPattern({ id: params.id, status: "applied", reviewedBy: params.reviewedBy });
    const metadata = pattern.metadata && typeof pattern.metadata === "object" ? pattern.metadata : {};
    const parts = suggestSplitParts(pattern.source_value);
    if (parts.length > 1) {
      await prisma.$executeRawUnsafe(
        `insert into agent.split_resolutions(term_type, source_value, resolution_json, status, metadata)
         values ($1, $2, $3::jsonb, 'active', $4::jsonb)
         on conflict (term_type, source_value) do update
           set resolution_json = excluded.resolution_json,
               status = excluded.status,
               metadata = excluded.metadata,
               updated_at = now()`,
        pattern.concept_type,
        pattern.source_value,
        JSON.stringify({ action: "split", parts }),
        JSON.stringify({ ...metadata, reviewedBy: params.reviewedBy ?? null }),
      );
    }
    return { pattern, applied: true, resolution: parts.length > 1 ? { action: "split", parts } : null };
  }
}

export const conceptResolverService = new ConceptResolverService();

async function createConceptResolverRun(params: { status: string; mode: string; input: unknown }) {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `insert into agent.concept_resolver_runs(status, mode, input_json, result_json)
     values ($1, $2, $3::jsonb, '{}'::jsonb)
     returning *`,
    params.status,
    params.mode,
    JSON.stringify(params.input ?? {}),
  );
  return mapBigInts(rows[0]);
}

async function finishConceptResolverRun(runId: string | number, params: { status: string; result: unknown }) {
  await prisma.$executeRawUnsafe(
    `update agent.concept_resolver_runs
     set status = $2, result_json = $3::jsonb, finished_at = now(), updated_at = now()
     where id = $1::bigint`,
    String(runId),
    params.status,
    JSON.stringify(params.result ?? {}),
  );
}

function inferResolution(candidate: {
  id: bigint;
  termType: string;
  rawValue: string;
  score: number;
  occurrenceCount: number;
  metadata: unknown;
}) {
  const conceptType = candidate.termType;
  const sourceValue = candidate.rawValue;
  const metadata = objectRecord(candidate.metadata);
  const candidateType = metadata.candidateType === "term_type" ? "term_type" : "value";
  const normalized = sourceValue.trim().replace(/\s+/g, " ");
  const hasSplitSignal = /[+＋/、,，;；]|及|和/.test(normalized);
  const numberUnit = /-?\d+(?:\.\d+)?/.test(normalized) ? normalizeNumberUnit(normalized) : null;
  const hasNumberUnit = Boolean(numberUnit && numberUnit.numberKind !== "none");
  const legacyIssues = [
    ...(hasSplitSignal ? [{ type: "possible_split", conceptType, sourceValue, parts: suggestSplitParts(sourceValue) }] : []),
    ...(hasNumberUnit ? [{ type: "number_unit_candidate", conceptType, sourceValue, parsed: numberUnit }] : []),
  ];
  const issues = conceptIssueDetectorService.detect({
    candidateType,
    termType: candidate.termType,
    rawFieldName: stringOrNull(metadata.rawFieldName ?? metadata.fieldName),
    rawValue: candidate.rawValue,
    sourceRawValue: stringOrNull(metadata.sourceRawValue),
    splitFromRawValue: stringOrNull(metadata.splitFromRawValue),
    valueKind: stringOrNull(metadata.valueKind),
    scope: stringOrNull(metadata.scope),
    occurrenceCount: candidate.occurrenceCount,
  });
  const topIssue = issues[0] ?? null;
  const routing = resolverRoutingService.route({
    candidateType,
    termType: candidate.termType,
    topIssue,
    occurrenceCount: candidate.occurrenceCount,
    aliasExact: false,
    issues,
    valueKind: stringOrNull(metadata.valueKind) ?? "enum",
    unifiedScore: Math.max(candidate.score, topIssue?.confidence ?? 0),
    hardConstraints: issues
      .filter((issue) => issue.blocksAutoApply)
      .map((issue) => ({
        id: issue.detector,
        blocksAutoAccept: true,
        reason: issue.reason,
        evidence: issue.evidence,
      })),
    config: { llmEnabled: false },
  });
  const status =
    routing.route === "auto_pass" || routing.route === "auto_accept_pending"
      ? "resolved"
      : routing.route === "auto_reject_pending"
        ? "rejected"
        : "needs_review";
  return {
    resolvedValue: hasSplitSignal || routing.recommendedAction === "split_value" ? null : normalized,
    confidence: routing.score,
    status,
    issues: [...legacyIssues, ...issues],
    routing,
    numberUnit,
  };
}

function adaptCandidate(candidate: {
  id: bigint;
  termType: string;
  rawValue: string;
  confidence: unknown;
  evidence: unknown;
}) {
  return {
    id: candidate.id,
    termType: candidate.termType,
    rawValue: candidate.rawValue,
    score: Number(candidate.confidence ?? 0),
    occurrenceCount: 0,
    metadata: candidate.evidence ?? {},
  };
}

async function upsertPatternReview(params: {
  conceptType: string;
  sourceValue: string;
  issue: unknown;
  runId: string | number | bigint;
}) {
  const issueType = params.issue && typeof params.issue === "object" ? String((params.issue as any).type ?? "issue") : "issue";
  const patternKey = `${params.conceptType}:${issueType}:${params.sourceValue}`.slice(0, 500);
  await prisma.$executeRawUnsafe(
    `insert into agent.concept_pattern_reviews(pattern_key, concept_type, source_value, status, metadata)
     values ($1, $2, $3, 'pending', $4::jsonb)
     on conflict (pattern_key) do update
       set metadata = excluded.metadata,
           updated_at = now()`,
    patternKey,
    params.conceptType,
    params.sourceValue,
    JSON.stringify({ issue: params.issue, runId: Number(params.runId) }),
  );
}

function suggestSplitParts(value: string) {
  return value
    .split(/[+＋/、,，;；]|及|和/g)
    .map((part) => part.trim())
    .filter(Boolean);
}

function mapBigInts(value: any): any {
  if (Array.isArray(value)) return value.map(mapBigInts);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      typeof item === "bigint" ? Number(item) : item instanceof Date ? item.toISOString() : mapBigInts(item),
    ]),
  );
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringOrNull(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function toJson(value: unknown): any {
  return JSON.parse(
    JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? Number(item) : item)),
  );
}
