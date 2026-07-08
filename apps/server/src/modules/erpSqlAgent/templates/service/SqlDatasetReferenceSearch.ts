export type DatasetReferenceSearchRow = {
  datasetId: bigint;
  familyId: string;
  module: string | null;
  intent: string | null;
  reportName: string | null;
  datasetName: string | null;
  questionText: string;
  sqlText: string;
  tables: unknown;
  fields: unknown;
  metrics: unknown;
  params: unknown;
  riskFlags: unknown;
  keywords: unknown;
  summary: string;
  businessDescription: string;
  timeScope: string;
  businessScenario: string;
  isFinance: boolean;
  verified: boolean;
  normalizedSqlPreview: string;
  embeddingVectorJson?: unknown;
  embeddingModel?: string | null;
};

export type DatasetReferenceSearchInput = {
  question: string;
  intent?: string;
  module?: string;
  limit?: number;
};

export function scoreDatasetReference(
  row: DatasetReferenceSearchRow,
  input: DatasetReferenceSearchInput,
): { score: number; matchedSignals: string[] } {
  const signals: string[] = [];
  let score = 0;
  if (input.intent && row.intent === input.intent) {
    score += 0.25;
    signals.push(`intent:${input.intent}`);
  }
  if (input.module && row.module === input.module) {
    score += 0.18;
    signals.push(`module:${input.module}`);
  }
  if (row.familyId && row.familyId !== "unclassified") {
    signals.push(`family:${row.familyId}`);
  }
  const arrays = [
    ...readStringArray(row.tables),
    ...readStringArray(row.fields),
    ...readStringArray(row.metrics),
    ...readStringArray(row.params),
    ...readStringArray(row.keywords),
  ];
  const haystack = normalize([
    row.familyId,
    row.module,
    row.intent,
    row.questionText,
    row.reportName,
    row.datasetName,
    row.summary,
    row.businessDescription,
    row.timeScope,
    row.businessScenario,
    ...arrays,
  ].filter(Boolean).join(" "));
  const tokens = questionTokens(input.question);
  let tokenHits = 0;
  for (const token of tokens) {
    if (haystack.includes(normalize(token))) {
      tokenHits += 1;
      signals.push(token, `semantic:${token}`);
    }
  }
  if (tokens.length > 0) score += 0.35 * Math.min(tokenHits / tokens.length, 1);
  const metricHits = readStringArray(row.metrics).filter((metric) => tokens.some((token) => normalize(metric).includes(normalize(token)) || normalize(token).includes(normalize(metric))));
  if (metricHits.length > 0) {
    score += Math.min(0.16, metricHits.length * 0.08);
    signals.push(...metricHits.map((metric) => `metric:${metric}`));
  }
  const schemaHits = arrays.filter((item) => tokens.some((token) => normalize(item).includes(normalize(token))));
  if (schemaHits.length > 0) {
    score += Math.min(0.12, schemaHits.length * 0.03);
    signals.push("schema_feature", ...schemaHits.slice(0, 5).map((item) => `schema:${item}`));
  }
  if (isFinanceQuestion(input.question) && isFinanceReference(row, haystack)) {
    score += 0.2;
    signals.push("finance");
  }
  if (row.familyId && row.familyId !== "unclassified") score += 0.04;
  if (row.verified) score += 0.03;
  return { score: round(Math.min(score, 1)), matchedSignals: [...new Set(signals)] };
}

export function rerankDatasetReferenceWithVector(
  mixedScore: number,
  matchedSignals: string[],
  rowVector: unknown,
  queryVector: number[] | null,
): { score: number; matchedSignals: string[] } {
  if (!queryVector) return { score: mixedScore, matchedSignals };
  const vectorScore = cosineSimilarity(readNumberArray(rowVector), queryVector);
  if (vectorScore === null) return { score: mixedScore, matchedSignals };
  return {
    score: round(0.75 * mixedScore + 0.25 * vectorScore),
    matchedSignals: [...new Set([...matchedSignals, `vector:${round(vectorScore)}`])],
  };
}

export function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function readNumberArray(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((item): item is number => typeof item === "number" && Number.isFinite(item)) : [];
}

export function cosineSimilarity(left: number[], right: number[]): number | null {
  if (left.length === 0 || left.length !== right.length) return null;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }
  if (leftNorm === 0 || rightNorm === 0) return null;
  return Math.max(0, (dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm)) + 1) / 2);
}

export function questionTokens(question: string): string[] {
  const tokens = question.match(/[A-Za-z]+\d*|\d+|[\u4e00-\u9fa5]{2,}/gu) ?? [];
  return [...new Set(tokens.flatMap((token) => /[\u4e00-\u9fa5]/u.test(token) ? [token, ...ngrams(token, 2)] : [token]))];
}

function isFinanceQuestion(question: string): boolean {
  return /财务|收入|应收|应付|发票|成本|利润|毛利|回款|付款|收款|税|余额|退款|实收/u.test(question);
}

function isFinanceReference(row: DatasetReferenceSearchRow, haystack: string): boolean {
  return row.isFinance || row.module === "finance" || /finance|财务|收入|应收|应付|发票|成本|利润|毛利|回款|付款|收款|税|余额|退款|实收/u.test(haystack);
}

function ngrams(value: string, size: number): string[] {
  const result: string[] = [];
  for (let index = 0; index <= value.length - size; index += 1) result.push(value.slice(index, index + size));
  return result;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/gu, "");
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}
