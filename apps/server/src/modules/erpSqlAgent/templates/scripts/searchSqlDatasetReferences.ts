import "../../../../config/env.js";

import { pathToFileURL } from "node:url";
import { prisma } from "../../../../lib/prisma.js";
import {
  sqlTemplateRepository,
  type DatasetReferenceCandidate,
  type ReferenceFamilyCandidate,
} from "../repository/SqlTemplateRepository.js";
import { parseArgs, requireArg } from "./cli.js";

export type SqlReferenceSearchReport = {
  kind: "sql_reference_search";
  question: string;
  datasetReferences: Array<ReturnType<typeof formatDatasetReference>>;
  familyReferences: Array<ReturnType<typeof formatFamilyReference>>;
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const question = requireArg(args, "question");
  const limit = typeof args.limit === "string" ? Number(args.limit) : 10;
  const [datasetReferences, familyReferences] = await Promise.all([
    sqlTemplateRepository.findDatasetReferenceCandidates({ question, limit }),
    sqlTemplateRepository.findReferenceCandidates({ question, limit: 3 }),
  ]);
  console.log(JSON.stringify(buildSqlReferenceSearchReport(question, datasetReferences, familyReferences), null, 2));
}

export function buildSqlReferenceSearchReport(
  question: string,
  datasetReferences: DatasetReferenceCandidate[],
  familyReferences: ReferenceFamilyCandidate[] = [],
): SqlReferenceSearchReport {
  return {
    kind: "sql_reference_search",
    question,
    datasetReferences: datasetReferences.map(formatDatasetReference),
    familyReferences: familyReferences.map(formatFamilyReference),
  };
}

function formatDatasetReference(reference: DatasetReferenceCandidate) {
  return {
    datasetId: reference.datasetId,
    familyId: reference.familyId,
    score: reference.score,
    reportName: reference.reportName,
    datasetName: reference.datasetName,
    questionText: reference.questionText,
    businessScenario: reference.businessScenario,
    timeScope: reference.timeScope,
    metrics: reference.metrics,
    tables: reference.coreTables,
    fields: reference.fields.slice(0, 20),
    isFinance: reference.isFinance,
    verified: reference.verified,
    matchedSignals: reference.matchedSignals,
    sqlPreview: reference.exampleSql,
  };
}

function formatFamilyReference(reference: ReferenceFamilyCandidate) {
  return {
    familyId: reference.familyId,
    score: reference.score,
    businessDescription: reference.businessDescription,
    tables: reference.coreTables,
    joins: reference.joins,
    matchedSignals: reference.matchedSignals,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
