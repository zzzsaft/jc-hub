import "../../../../config/env.js";

import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ErpSqlQueryError, getErpSqlQueryClient, type ErpSqlQueryResult } from "../../query/index.js";
import { parseArgs, requireArg } from "./cli.js";

type ValidationReport = {
  templates?: ValidationTemplate[];
};

type ValidationTemplate = {
  familyId: string;
  name?: string;
  compileValidation?: CompileValidation;
};

type CompileValidation = {
  status?: string;
  compileStatus?: string;
  rawExecutorStatusCode?: number | null;
  rawExecutorErrorMessage?: string | null;
  rawExecutorResponseBody?: unknown;
  sqlServerErrorNumber?: number | null;
  sqlServerErrorState?: number | null;
  sqlServerErrorLine?: number | null;
  validationMode?: string;
  parameterSubstitutions?: Record<string, string>;
  expandedCompileSql?: string;
};

type QueryClient = {
  query(options: { sql: string; maxRows?: number }): Promise<ErpSqlQueryResult>;
};

type ProbeResult = {
  probeName: string;
  status: "pass" | "fail" | "skipped";
  rowCount: number;
  columns: string[];
  error: string | null;
};

type DebugReport = {
  familyId: string;
  templateName: string;
  compileStatus: string;
  rawExecutorStatusCode: number | null;
  rawExecutorErrorMessage: string | null;
  rawExecutorResponseBody: unknown;
  sqlServerErrorNumber: number | null;
  sqlServerErrorState: number | null;
  sqlServerErrorLine: number | null;
  validationMode: string | null;
  parameterSubstitutions: Record<string, string>;
  expandedCompileSql: string;
  full_compile_sql: string;
  inner_template_sql: string;
  minimal_probe_sql: string;
  rcv_probe_sql: string;
  probes: ProbeResult[];
  diagnosis: string;
};

const MINIMAL_PROBE_SQL = `SELECT TOP 1
  poh.Company,
  poh.PONum,
  pod.POLine,
  por.PORelNum,
  pod.PartNum,
  pod.LineDesc,
  por.DueDate,
  por.PromiseDt,
  por.XRelQty
FROM Erp.POHeader poh
INNER JOIN Erp.PODetail pod
  ON pod.Company = poh.Company
 AND pod.PONum = poh.PONum
INNER JOIN Erp.PORel por
  ON por.Company = pod.Company
 AND por.PONum = pod.PONum
 AND por.POLine = pod.POLine
WHERE poh.Company = 'jctimes'`;

const RCV_PROBE_SQL = `SELECT TOP 1
  poh.Company,
  poh.PONum,
  pod.POLine,
  por.PORelNum,
  pod.PartNum,
  pod.LineDesc,
  por.DueDate,
  por.PromiseDt,
  por.XRelQty,
  COALESCE(rcv.ReceivedQty, 0) AS ReceivedQty
FROM Erp.POHeader poh
INNER JOIN Erp.PODetail pod
  ON pod.Company = poh.Company
 AND pod.PONum = poh.PONum
INNER JOIN Erp.PORel por
  ON por.Company = pod.Company
 AND por.PONum = pod.PONum
 AND por.POLine = pod.POLine
LEFT JOIN (
  SELECT
    Company,
    PONum,
    POLine,
    PORelNum,
    SUM(OurQty) AS ReceivedQty,
    MAX(ReceiptDate) AS LastReceiptDate
  FROM Erp.RcvDtl
  GROUP BY Company, PONum, POLine, PORelNum
) rcv
  ON rcv.Company = por.Company
 AND rcv.PONum = por.PONum
 AND rcv.POLine = por.POLine
 AND rcv.PORelNum = por.PORelNum
WHERE poh.Company = 'jctimes'`;

const BANNED_PROBE_SQL = /\b(INSERT|UPDATE|DELETE|EXEC|EXECUTE|DROP|CREATE|ALTER|TRUNCATE|MERGE)\b/iu;

export async function buildDraftDebugReport(options: {
  validationPath: string;
  familyId: string;
  runProbes?: boolean;
  queryClient?: QueryClient;
}): Promise<DebugReport> {
  const validation = JSON.parse(await fs.readFile(options.validationPath, "utf8")) as ValidationReport;
  const template = validation.templates?.find((item) => item.familyId === options.familyId);
  if (!template) throw new Error(`Missing family in validation report: ${options.familyId}`);

  const compile = template.compileValidation ?? {};
  const expandedCompileSql = compile.expandedCompileSql ?? "";
  const probes = options.runProbes ? await runProbes(options.queryClient ?? getErpSqlQueryClient()) : [];
  return {
    familyId: template.familyId,
    templateName: template.name ?? "",
    compileStatus: compile.compileStatus ?? compile.status ?? "",
    rawExecutorStatusCode: compile.rawExecutorStatusCode ?? null,
    rawExecutorErrorMessage: compile.rawExecutorErrorMessage ?? null,
    rawExecutorResponseBody: compile.rawExecutorResponseBody ?? null,
    sqlServerErrorNumber: compile.sqlServerErrorNumber ?? null,
    sqlServerErrorState: compile.sqlServerErrorState ?? null,
    sqlServerErrorLine: compile.sqlServerErrorLine ?? null,
    validationMode: compile.validationMode ?? null,
    parameterSubstitutions: compile.parameterSubstitutions ?? {},
    expandedCompileSql,
    full_compile_sql: expandedCompileSql,
    inner_template_sql: unwrapCompileSql(expandedCompileSql),
    minimal_probe_sql: MINIMAL_PROBE_SQL,
    rcv_probe_sql: RCV_PROBE_SQL,
    probes,
    diagnosis: diagnose(compile.compileStatus ?? compile.status ?? "", probes),
  };
}

export async function writeDraftDebugReport(report: DebugReport, options: { out: string; jsonOut: string }): Promise<void> {
  await fs.mkdir(path.dirname(path.resolve(options.jsonOut)), { recursive: true });
  await fs.writeFile(options.jsonOut, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fs.mkdir(path.dirname(path.resolve(options.out)), { recursive: true });
  await fs.writeFile(options.out, renderMarkdown(report), "utf8");
}

function unwrapCompileSql(sql: string): string {
  const prefix = "SELECT TOP 0 * FROM (\n";
  const suffix = "\n) AS draft_validate";
  return sql.startsWith(prefix) && sql.endsWith(suffix) ? sql.slice(prefix.length, -suffix.length) : sql;
}

async function runProbes(client: QueryClient): Promise<ProbeResult[]> {
  return Promise.all([
    runProbe(client, "minimal_probe_sql", MINIMAL_PROBE_SQL),
    runProbe(client, "rcv_probe_sql", RCV_PROBE_SQL),
  ]);
}

async function runProbe(client: QueryClient, probeName: string, sql: string): Promise<ProbeResult> {
  const safetyError = validateProbeSql(sql);
  if (safetyError) return { probeName, status: "skipped", rowCount: 0, columns: [], error: safetyError };
  try {
    const result = await client.query({ sql, maxRows: 1 });
    return { probeName, status: "pass", rowCount: result.rowCount, columns: result.fields, error: null };
  } catch (error) {
    return { probeName, status: "fail", rowCount: 0, columns: [], error: errorMessage(error) };
  }
}

function validateProbeSql(sql: string): string | null {
  if (!/^\s*SELECT\s+TOP\s+1\b/iu.test(sql)) return "Probe must be SELECT TOP 1.";
  if (!/\bpoh\.Company\s*=\s*'jctimes'/iu.test(sql)) return "Probe must use company='jctimes'.";
  if (BANNED_PROBE_SQL.test(sql)) return "Probe contains banned write/DDL/EXEC keyword.";
  return null;
}

function diagnose(compileStatus: string, probes: ProbeResult[]): string {
  if (!probes.length) return "Probes not run.";
  const minimal = probes.find((probe) => probe.probeName === "minimal_probe_sql");
  const rcv = probes.find((probe) => probe.probeName === "rcv_probe_sql");
  if (minimal?.status === "fail") return "POHeader/PODetail/PORel fields or joins still have an issue.";
  if (minimal?.status === "pass" && rcv?.status === "fail") return "RcvDtl aggregate fields or PORelNum grain likely have an issue.";
  if (minimal?.status === "pass" && rcv?.status === "pass" && compileStatus === "fail") {
    return "Issue is likely in parameter substitution, WHERE clauses, DATEADD, CAST(GETDATE()), compile wrapper, or executor handling.";
  }
  return "No probe diagnosis available.";
}

function renderMarkdown(report: DebugReport): string {
  return `${[
    "# SQL Template Draft Debug - family_062",
    "",
    "## Compile Debug",
    "",
    `- familyId: ${report.familyId}`,
    `- templateName: ${report.templateName}`,
    `- compileStatus: ${report.compileStatus}`,
    `- rawExecutorStatusCode: ${report.rawExecutorStatusCode ?? ""}`,
    `- rawExecutorErrorMessage: ${report.rawExecutorErrorMessage ?? ""}`,
    `- sqlServerErrorNumber: ${report.sqlServerErrorNumber ?? ""}`,
    `- sqlServerErrorState: ${report.sqlServerErrorState ?? ""}`,
    `- sqlServerErrorLine: ${report.sqlServerErrorLine ?? ""}`,
    `- validationMode: ${report.validationMode ?? ""}`,
    `- rawExecutorResponseBody: ${JSON.stringify(report.rawExecutorResponseBody)}`,
    "",
    "parameterSubstitutions:",
    "",
    "```json",
    JSON.stringify(report.parameterSubstitutions, null, 2),
    "```",
    "",
    "expandedCompileSql:",
    "",
    "```sql",
    report.expandedCompileSql,
    "```",
    "",
    "## full_compile_sql",
    "",
    "```sql",
    report.full_compile_sql,
    "```",
    "",
    "## inner_template_sql",
    "",
    "```sql",
    report.inner_template_sql,
    "```",
    "",
    "## minimal_probe_sql",
    "",
    "```sql",
    report.minimal_probe_sql,
    "```",
    "",
    "## rcv_probe_sql",
    "",
    "```sql",
    report.rcv_probe_sql,
    "```",
    "",
    "## Probe Results",
    "",
    ...(report.probes.length
      ? report.probes.map((probe) => `- ${probe.probeName}: ${probe.status}, rowCount=${probe.rowCount}, columns=${JSON.stringify(probe.columns)}, error=${probe.error ?? ""}`)
      : ["- not run"]),
    "",
    "## Diagnosis",
    "",
    report.diagnosis,
    "",
  ].join("\n")}\n`;
}

function errorMessage(error: unknown): string {
  if (error instanceof ErpSqlQueryError) return `${error.message}; response=${JSON.stringify(error.responseBody)}`;
  return error instanceof Error ? error.message : String(error);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const report = await buildDraftDebugReport({
    validationPath: requireArg(args, "validation"),
    familyId: requireArg(args, "family-id"),
    runProbes: args["run-probes"] === true,
  });
  await writeDraftDebugReport(report, {
    out: requireArg(args, "out"),
    jsonOut: requireArg(args, "json-out"),
  });
  console.log(JSON.stringify({ familyId: report.familyId, compileStatus: report.compileStatus, probes: report.probes }, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
