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
type AcceptanceCase = ReturnType<typeof loadSqlTemplateGoldenQuestions>[number] & { conversationKey?: string };
type SessionMatchKind = "exact_user_message" | "exact_title" | "conversation" | "new";

const DISCOVERIES = [
  { key: "orderNum", question: "查最近的待发货销售订单", fields: ["order", "ordernum"] },
  { key: "poNum", question: "查最近延期未到货采购订单", fields: ["ponum", "purchaseordernum"] },
  { key: "jobNum", question: "查最近未完工工单的工序进度", fields: ["job", "jobnum"] },
  { key: "partNum", question: "按物料查看库存明细", fields: ["product", "partnum"] },
  { key: "customerName", question: "按客户查销售订单列表", fields: ["customer", "customername"] },
  { key: "vendorName", question: "按供应商查最近未到货采购订单", fields: ["supplier", "suppliername", "vendor", "vendorname"] },
  { key: "warehouseCode", question: "查最近有库存的仓库和物料", fields: ["warehouse", "warehousecode", "whsecode"] },
  { key: "resourceGroupId", question: "查最近报工使用的资源群组", fields: ["resourcegroupid", "resourcegroup", "resource"] },
] as const;

const PLACEHOLDER_PATTERNS: Record<string, RegExp> = {
  orderNum: /(?:订单|销售订单)\s*(?:10086|20001|30002|40003|50005)/u,
  poNum: /采购订单\s*(?:88888|10086)/u,
  jobNum: /(?:J12345|工单\s*88888)/u,
  partNum: /(?:ABC123|某个物料)/u,
  materialPartNum: /(?:ABC123|某个物料)/u,
  customerName: /客户(?:某某|\s*A)/u,
  vendorName: /供应商(?:某某|\s*ABC)/u,
  warehouseCode: /(?:仓库|库位)\s*(?:W01|WH01)/u,
  resourceGroupId: /(?:资源组|资源群组)\s*RG01/u,
};

export function normalizeHttpAcceptanceConcurrency(value: unknown): number {
  const numeric = Number(value);
  return Math.min(Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : 2, 4);
}

export function substituteGoldenPlaceholders(question: string, values: Record<string, string>): string {
  return question
    .replace(/(?:订单|销售订单)\s*(?:10086|20001|30002|40003|50005)/gu, (match) => match.replace(/\d+/u, values.orderNum ?? match.match(/\d+/u)?.[0] ?? ""))
    .replace(/采购订单\s*(?:88888|10086)/gu, (match) => match.replace(/\d+/u, values.poNum ?? match.match(/\d+/u)?.[0] ?? ""))
    .replace(/J12345/gu, values.jobNum ?? "J12345")
    .replace(/工单\s*88888/gu, values.jobNum ? `工单 ${values.jobNum}` : "$&")
    .replace(/ABC123/gu, values.partNum ?? "ABC123")
    .replace(/客户(?:某某|\s*A)/gu, values.customerName ? `客户 ${values.customerName}` : "$&")
    .replace(/供应商(?:某某|\s*ABC)/gu, values.vendorName ? `供应商 ${values.vendorName}` : "$&")
    .replace(/某个物料/gu, values.partNum ?? "某个物料")
    .replace(/(?:资源组|资源群组)\s*RG01/gu, (match) => values.resourceGroupId ? match.replace(/RG01/u, values.resourceGroupId) : match);
}

export function validatePlaceholderCompleteness(
  contracts: ReturnType<typeof loadSqlTemplateGoldenQuestions>,
  values: Record<string, string>,
): string[] {
  const errors: string[] = [];
  for (const key of requiredDiscoveryKeys(contracts)) {
    if (!values[key]) errors.push(`missing discovery: ${key}`);
  }
  for (const contract of contracts) {
    const question = substituteGoldenPlaceholders(contract.question, values);
    const residual = Object.values(PLACEHOLDER_PATTERNS).find((pattern) => pattern.test(question));
    if (residual) errors.push(`unresolved placeholder: ${contract.requiredFilters.find((filter) => PLACEHOLDER_PATTERNS[filter]?.test(question)) ?? "unknown"}`);
  }
  return [...new Set(errors)];
}

export async function runGoldenHttpAcceptance(options: {
  baseUrl: string;
  token?: string;
  concurrency?: number;
  fetchFn?: Fetch;
  cases?: AcceptanceCase[];
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
  const run = (message: string, sessionId?: string) => postSse(fetchFn, new URL("/agentRuntime/run/stream", options.baseUrl), headers, message, sessionId);
  await pollHealth();
  const contracts: AcceptanceCase[] = options.cases ?? loadSqlTemplateGoldenQuestions();
  const requiredKeys = new Set(requiredDiscoveryKeys(contracts).map((key) => key === "materialPartNum" ? "partNum" : key));
  const placeholders: Record<string, string> = {};
  const discoveryTraceIds: string[] = [];
  for (const discovery of DISCOVERIES) {
    if (!requiredKeys.has(discovery.key)) continue;
    const { result } = await run(discovery.question);
    if (result.traceId) discoveryTraceIds.push(result.traceId);
    const value = firstFieldValue(result, discovery.fields);
    if (value) placeholders[discovery.key] = value;
  }

  if (placeholders.partNum) placeholders.materialPartNum = placeholders.partNum;
  const discoveryFailures = validatePlaceholderCompleteness(contracts, placeholders);
  const evaluated: Array<{ contract: (typeof contracts)[number]; result: StructuredResult; question: string; reused: boolean; sessionMatchKind: SessionMatchKind }> = [];
  const conversations = new Map<string, { sessionId: string; reused: boolean; sessionMatchKind: SessionMatchKind }>();
  const sessionLocks = new Map<string, Promise<void>>();
  let next = 0;
  if (discoveryFailures.length === 0) await Promise.all(Array.from({ length: Math.min(concurrency, contracts.length) }, async () => {
    for (;;) {
      const contract = contracts[next++];
      if (!contract) return;
      const question = substituteGoldenPlaceholders(contract.question, placeholders);
      await withSessionLock(sessionLocks, contract.conversationKey ? `conversation:${contract.conversationKey}` : "", async () => {
        let result: StructuredResult;
        let session = contract.conversationKey ? conversations.get(contract.conversationKey) : undefined;
        if (!session) {
          const match = await findExactSession(fetchFn, options.baseUrl, headers, contract.question);
          session = { sessionId: match.sessionId ?? "", reused: match.reused, sessionMatchKind: match.sessionMatchKind };
        } else {
          session = { ...session, reused: true, sessionMatchKind: "conversation" };
        }
        try {
          const completed = await withSessionLock(sessionLocks, session.sessionId, () => run(question, session.sessionId || undefined));
          result = completed.result;
          if (!session.sessionId) session.sessionId = completed.sessionId;
          if (contract.conversationKey && session.sessionId) conversations.set(contract.conversationKey, session);
        } catch {
          result = { success: false, transportError: true, traceId: `transport-${randomUUID()}` };
        }
        evaluated.push({ contract, result, question, reused: session.reused, sessionMatchKind: session.sessionMatchKind });
      });
      await pollHealth();
    }
  }));
  await pollHealth();

  return {
    transport: "http_sse" as const,
    concurrency,
    placeholderKeys: Object.keys(placeholders),
    discoveryTraceIds,
    discoveryFailures,
    healthFailures,
    report: buildGoldenCapabilityReport(evaluated.map(({ contract, result }) => ({ contract, result }))),
    results: evaluated.map(({ contract, question, result, reused, sessionMatchKind }) => ({
      contractQuestion: contract.question,
      substituted: question !== contract.question,
      success: result.success,
      outcome: result.outcome,
      capabilityCode: result.capabilityCode,
      reasonCode: result.reasonCode,
      traceId: result.traceId,
      semanticStatus: result.semanticStatus,
      executionPath: result.executionPath,
      scope: redactScope(result.scope),
      guardErrorCount: result.guardErrors?.length ?? 0,
      transportError: result.transportError,
      reused,
      sessionMatchKind,
    })),
  };
}

async function postSse(fetchFn: Fetch, url: URL, headers: Record<string, string>, message: string, sessionId?: string): Promise<{ result: StructuredResult; sessionId: string }> {
  const response = await fetchFn(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ agentType: "mastraErpSqlAgent", confirmed: true, message, ...(sessionId ? { sessionId } : {}) }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  const frames = (await response.text()).split(/\r?\n\r?\n/gu);
  for (const frame of frames) {
    if (!/^event: complete$/mu.test(frame)) continue;
    const data = frame.match(/^data: (.+)$/mu)?.[1];
    if (!data) continue;
    const complete = record(JSON.parse(data));
    const result = record(record(complete.artifacts).erpSqlResult);
    return { result: result as StructuredResult, sessionId: String(record(complete.session).id ?? sessionId ?? "") };
  }
  throw new Error("HTTP SSE response did not contain a complete ERP SQL result");
}

async function findExactSession(fetchFn: Fetch, baseUrl: string, headers: Record<string, string>, question: string): Promise<{ sessionId?: string; reused: boolean; sessionMatchKind: SessionMatchKind }> {
  for (let page = 1; ; page += 1) {
    const url = new URL("/agentRuntime/sessions", baseUrl);
    url.search = new URLSearchParams({ agentType: "mastraErpSqlAgent", status: "active", keyword: question, page: String(page), pageSize: "100" }).toString();
    const response = await fetchFn(url, { headers });
    if (!response.ok) throw new Error(`Session search HTTP ${response.status}`);
    const list = record(await response.json());
    const items = Array.isArray(list.items) ? list.items.map(record) : [];
    for (const item of items) {
      const id = typeof item.id === "string" ? item.id : undefined;
      if (!id) continue;
      const detailResponse = await fetchFn(new URL(`/agentRuntime/sessions/${encodeURIComponent(id)}`, baseUrl), { headers });
      if (!detailResponse.ok) throw new Error(`Session detail HTTP ${detailResponse.status}`);
      const detail = record(await detailResponse.json());
      const messages = Array.isArray(detail.messages) ? detail.messages.map(record) : [];
      const firstUser = messages.find((message) => message.role === "user" && typeof message.content === "string");
      if (normalizeText(String(firstUser?.content ?? "")) === normalizeText(question)) return { sessionId: id, reused: true, sessionMatchKind: "exact_user_message" };
      if (normalizeText(String(item.title ?? "")) === normalizeText(question)) return { sessionId: id, reused: true, sessionMatchKind: "exact_title" };
    }
    const total = Number(list.total ?? 0);
    if (page * 100 >= total || items.length === 0) break;
  }
  return { reused: false, sessionMatchKind: "new" };
}

async function withSessionLock<T>(locks: Map<string, Promise<void>>, sessionId: string, task: () => Promise<T>): Promise<T> {
  if (!sessionId) return task();
  const previous = locks.get(sessionId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const chain = previous.then(() => current);
  locks.set(sessionId, chain);
  await previous;
  try { return await task(); } finally {
    release();
    if (locks.get(sessionId) === chain) locks.delete(sessionId);
  }
}

function normalizeText(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function firstFieldValue(result: StructuredResult, aliases: readonly string[]): string | undefined {
  const fields = result.fields ?? [];
  const index = fields.findIndex((field) => aliases.includes(field.replace(/[^a-z0-9]/giu, "").toLowerCase()));
  const value = index >= 0 ? result.rows?.[0]?.[index] : undefined;
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

function redactScope(scope: StructuredResult["scope"]): StructuredResult["scope"] {
  if (!scope) return undefined;
  return {
    ...scope,
    filters: Object.fromEntries(Object.keys(scope.filters).map((key) => [key, "[redacted]"])),
  };
}

function requiredDiscoveryKeys(contracts: ReturnType<typeof loadSqlTemplateGoldenQuestions>): string[] {
  return [...new Set(contracts.flatMap((contract) => contract.requiredFilters.filter((filter) => PLACEHOLDER_PATTERNS[filter]?.test(contract.question))))];
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
    if (report.healthFailures.length || report.discoveryFailures.length || report.report.failures.length) process.exitCode = 1;
  }).catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
