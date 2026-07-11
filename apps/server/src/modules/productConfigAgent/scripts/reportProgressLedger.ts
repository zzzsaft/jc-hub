import "../../../config/env.js";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { prisma } from "../../../lib/prisma.js";
import { buildProductConfigProgressLedger } from "../progress/progressLedger.js";

const DEFAULT_OUT_DIR = "tmp/product-config-progress-ledger";

export type ProgressLedgerCliOptions = {
  outDir: string;
  writeFiles: boolean;
  bandSize?: number;
};

export function parseProgressLedgerArgs(args: string[]): ProgressLedgerCliOptions {
  const options: ProgressLedgerCliOptions = {
    outDir: DEFAULT_OUT_DIR,
    writeFiles: true,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--no-files") {
      options.writeFiles = false;
      continue;
    }
    if (arg === "--apply") throw new Error("This report is read-only; --apply is not supported");
    if (arg === "--out-dir" || arg === "--band-size") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value`);
      assignOption(options, arg.slice(2), value);
      index += 1;
      continue;
    }
    if (arg.startsWith("--out-dir=") || arg.startsWith("--band-size=")) {
      const [name, ...valueParts] = arg.slice(2).split("=");
      assignOption(options, name, valueParts.join("="));
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

export async function runProgressLedgerCli(args = process.argv.slice(2)) {
  const options = parseProgressLedgerArgs(args);
  const report = await buildProductConfigProgressLedger({ bandSize: options.bandSize });
  const summary = { generatedAt: report.generatedAt, ...report.summary };

  if (options.writeFiles) {
    const outDir = path.resolve(options.outDir);
    await mkdir(outDir, { recursive: true });
    await Promise.all([
      writeFile(path.join(outDir, "summary.json"), `${stringifyJson(summary)}\n`),
      writeFile(path.join(outDir, "ledger.tsv"), toTsv(report.ledger)),
      writeFile(path.join(outDir, "bands.tsv"), toTsv(report.bands)),
      writeFile(path.join(outDir, "report.md"), buildMarkdownReport(report)),
    ]);
  }

  console.log(stringifyJson(summary));
  return report;
}

function assignOption(options: ProgressLedgerCliOptions, name: string, value: string) {
  if (name === "out-dir") {
    if (!value.trim()) throw new Error("--out-dir requires a non-empty value");
    options.outDir = value;
    return;
  }
  const bandSize = Number(value);
  if (!Number.isSafeInteger(bandSize) || bandSize <= 0) {
    throw new Error("--band-size must be a positive integer");
  }
  options.bandSize = bandSize;
}

function toTsv(rows: readonly object[]): string {
  if (rows.length === 0) return "";
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const lines = [headers.join("\t")];
  for (const row of rows) {
    const record = row as Record<string, unknown>;
    lines.push(headers.map((header) => tsvCell(record[header])).join("\t"));
  }
  return `${lines.join("\n")}\n`;
}

function tsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "object" ? stringifyJson(value, false) : String(value);
  return /[\t\r\n"]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function buildMarkdownReport(report: Awaited<ReturnType<typeof buildProductConfigProgressLedger>>): string {
  const summary = report.summary;
  return [
    "# ProductConfigAgent 进度总账",
    "",
    `生成时间：${report.generatedAt}`,
    "",
    `文档总数：${summary.total}`,
    "",
    countTable("阶段", summary.stageCounts),
    countTable("终态", summary.terminalCounts),
    countTable("就绪状态", summary.readinessCounts),
    countTable("阻塞原因", summary.blockerCounts),
    "## 文档区间",
    "",
    "| 区间 | 起始 ID | 结束 ID | 文档数 |",
    "| --- | ---: | ---: | ---: |",
    ...report.bands.map((band) =>
      `| ${band.startDocumentId}-${band.endDocumentId} | ${band.startDocumentId} | ${band.endDocumentId} | ${band.total} |`,
    ),
    "",
  ].join("\n");
}

function countTable(title: string, counts: Record<string, number>): string {
  return [
    `## ${title}`,
    "",
    "| 状态 | 数量 |",
    "| --- | ---: |",
    ...Object.entries(counts)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, count]) => `| ${escapeMarkdown(name)} | ${count} |`),
    "",
  ].join("\n");
}

function escapeMarkdown(value: string) {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function stringifyJson(value: unknown, pretty = true): string {
  return JSON.stringify(value, (_, item) => (typeof item === "bigint" ? item.toString() : item), pretty ? 2 : 0);
}

function isDirectRun() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isDirectRun()) {
  runProgressLedgerCli()
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
