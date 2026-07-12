import "../../../config/env.js";

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { loadSqlTemplateGoldenQuestions } from "../templates/service/SqlTemplateRetrievalEvalService.js";
import { buildGoldenCapabilityReport, type GoldenCapabilityObservedResult } from "./buildGoldenCapabilityReport.js";

type Fetch = typeof fetch;
type StructuredResult = GoldenCapabilityObservedResult & {
  fields?: string[];
  rows?: unknown[][];
};

const DISCOVERIES = [
  { key: "orderNum", question: "查最近的待发货销售订单", fields: ["order", "ordernum"] },
  { key: "poNum", question: "查最近延期未到货采购订单", fields: ["ponum", "purchaseordernum"] },
  { key: "jobNum", question: "查最近未完工工单的工序进度", fields: ["job", "jobnum"] },
  { key: "partNum", question: "按物料查看库存明细", fields: ["product", "partnum"] },
  { key: "customerName", question: "按客户查销售订单列表", fields: ["customer", "customername"] },
] as const;

export function normalizeHttpAcceptanceConcurrency(value: unknown): number {
  const numeric = Number(value);
  return Math.min(Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : 2, 4);
}

export function substituteGoldenPlaceholders(question: string, values: Record<string, string>): string {
  return question
    .replace(/(?:订单|销售订单)\s*(?:10086|20001|30002|40003|50005)/gu, (match) => match.replace(/\d+/u, values.orderNum ?? match.match(/\d+/u)?.[0] ?? ""))
    .replace(/采购订单\s*(?:88888|10086)/gu, (match) => match.replace(/\d+/u, values.poNum ?? match.match(/\d+/u)?.[0] ?? ""))
    .replace(/J12345/gu, values.jobNum ?? "J12345")
    .replace(/客户(?:某某|\s*A)/gu, values.customerName ? `客户 ${values.customerName}` : "$&")
    .replace(/某个物料/gu, values.partNum ?? "某个物料");
}

export async function runGoldenHttpAcceptance(options: {
  baseUrl: string;
  token?: string;
  concurrency?: number;
  fetchFn?: Fetch;
  cases?: ReturnType<typeof loadSqlTemplateGoldenQuestions>;
}) {
  const fetchFn = options.fetchFn ?? fetch;
  const concurrency = normalizeHttpAcceptanceConcurrency(options.concurrency);
  const headers = {
    "Content-Type": "application/json",
    ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
  };
  const healthFailures: Array<{ at: string; status?: number; error?: string }> = [];
  const pollHealth = async () => {
    try {
      const response = await fetchFn(new URL("/health", options.baseUrl), { headers });
      if (response.status !== 200) healthFailures.push({ at: new Date().toISOString(), status: response.status });
    } catch (error) {
      healthFailures.push({ at: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) });
    }
  };
  const run = (message: string) => postSse(fetchFn, new URL("/agentRuntime/run/stream", options.baseUrl), headers, message);
  await pollHealth();
  const placeholders: Record<string, string> = {};
  const discoveryTraceIds: string[] = [];
  for (const discovery of DISCOVERIES) {
    const result = await run(discovery.question);
    if (result.traceId) discoveryTraceIds.push(result.traceId);
    const value = firstFieldValue(result, discovery.fields);
    if (value) placeholders[discovery.key] = value;
  }

  const contracts = options.cases ?? loadSqlTemplateGoldenQuestions();
  const evaluated: Array<{ contract: (typeof contracts)[number]; result: StructuredResult; question: string }> = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, contracts.length) }, async () => {
    for (;;) {
      const contract = contracts[next++];
      if (!contract) return;
      const question = substituteGoldenPlaceholders(contract.question, placeholders);
      let result: StructuredResult;
      try {
        result = await run(question);
      } catch {
        result = { success: false, transportError: true, traceId: `transport-${randomUUID()}` };
      }
      evaluated.push({ contract, result, question });
      await pollHealth();
    }
  }));
  await pollHealth();

  return {
    transport: "http_sse" as const,
    concurrency,
    placeholderKeys: Object.keys(placeholders),
    discoveryTraceIds,
    healthFailures,
    report: buildGoldenCapabilityReport(evaluated.map(({ contract, result }) => ({ contract, result }))),
    results: evaluated.map(({ contract, question, result }) => ({
      contractQuestion: contract.question,
      substituted: question !== contract.question,
      success: result.success,
      outcome: result.outcome,
      capabilityCode: result.capabilityCode,
      reasonCode: result.reasonCode,
      traceId: result.traceId,
      semanticStatus: result.semanticStatus,
      scope: result.scope,
      guardErrors: result.guardErrors,
      transportError: result.transportError,
    })),
  };
}

async function postSse(fetchFn: Fetch, url: URL, headers: Record<string, string>, message: string): Promise<StructuredResult> {
  const response = await fetchFn(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ agentType: "mastraErpSqlAgent", confirmed: true, message }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  const frames = (await response.text()).split(/\r?\n\r?\n/gu);
  for (const frame of frames) {
    if (!/^event: complete$/mu.test(frame)) continue;
    const data = frame.match(/^data: (.+)$/mu)?.[1];
    if (!data) continue;
    const complete = record(JSON.parse(data));
    const result = record(record(complete.artifacts).erpSqlResult);
    return result as StructuredResult;
  }
  throw new Error("HTTP SSE response did not contain a complete ERP SQL result");
}

function firstFieldValue(result: StructuredResult, aliases: readonly string[]): string | undefined {
  const fields = result.fields ?? [];
  const index = fields.findIndex((field) => aliases.includes(field.replace(/[^a-z0-9]/giu, "").toLowerCase()));
  const value = index >= 0 ? result.rows?.[0]?.[index] : undefined;
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function parseArgs(args: string[]): Record<string, string> {
  return Object.fromEntries(args.map((arg) => {
    const [key, ...value] = arg.replace(/^--/u, "").split("=");
    return [key, value.join("=")];
  }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = args["base-url"];
  if (!baseUrl) throw new Error("--base-url is required");
  runGoldenHttpAcceptance({
    baseUrl,
    token: args.token,
    concurrency: Number(args.concurrency),
  }).then(async (report) => {
    const out = args.out ?? "tmp/golden-http-acceptance.json";
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({ out, counts: report.report.counts, healthFailures: report.healthFailures.length }, null, 2));
    if (report.healthFailures.length || report.report.failures.length) process.exitCode = 1;
  }).catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
