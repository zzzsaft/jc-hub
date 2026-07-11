import crypto from "node:crypto";
import { createReadStream } from "node:fs";
import path from "node:path";
import { parseExcelFile } from "../excelParser/index.js";
import { productConfigAgentRepository } from "../db.service.js";
import type {
  ParseBlocksBatchError,
  ParseBlocksBatchResult,
  ParseBlocksBatchSuccess,
  ParseBlocksInput,
} from "./types.js";

export type BlockParsingDependencies = {
  calculateFileSha256?: (filePath: string) => Promise<string>;
  parseBlocks?: (input: ParseBlocksInput) => Promise<unknown>;
  repository?: {
    findDocumentByHash(fileHash: string): Promise<any | null>;
    createDocument(data: {
      fileName?: string;
      fileHash?: string;
      filePath: string;
      source?: string;
      status?: string;
    }): Promise<any>;
    findBlocksByDocumentId(documentId: string | number): Promise<any | null>;
    upsertBlocks(data: {
      documentId: string | number;
      blocksJson: unknown;
      parserVersion?: string;
    }): Promise<any>;
    updateDocumentStatus(documentId: string | number, status: string): Promise<unknown>;
  };
};

const DEFAULT_PARSER_VERSION = "v2";

export class ProductConfigAgentBlockParsingService {
  constructor(private readonly dependencies: BlockParsingDependencies = {}) {}

  async parseAndSaveBlocks(input: ParseBlocksInput) {
    const repository = this.dependencies.repository ?? productConfigAgentRepository;
    const fileName = input.fileName ?? path.basename(input.filePath);
    const fileHash = await (this.dependencies.calculateFileSha256 ?? calculateFileSha256)(input.filePath);
    let document = await repository.findDocumentByHash(fileHash);
    if (!document) {
      document = await repository.createDocument({
        fileName,
        fileHash,
        filePath: input.filePath,
        source: input.source ?? "manual",
        status: "uploaded",
      });
    }

    const existingBlocks = input.forceReparse === true
      ? null
      : await repository.findBlocksByDocumentId(document.id);
    if (existingBlocks) {
      return { document, blocks: existingBlocks, reusedBlocks: true };
    }

    const blocksJson = input.blocksJson ?? await (this.dependencies.parseBlocks ?? parseBlocksFromExcel)(input);
    const blocks = await repository.upsertBlocks({
      documentId: document.id,
      blocksJson,
      parserVersion: input.parserVersion ?? DEFAULT_PARSER_VERSION,
    });
    await repository.updateDocumentStatus(document.id, "parsed");
    return { document: { ...document, status: "parsed" }, blocks, reusedBlocks: false };
  }

  async parseAndSaveBlocksBatch(inputs: ParseBlocksInput[]): Promise<ParseBlocksBatchResult> {
    const successes: ParseBlocksBatchSuccess[] = [];
    const errors: ParseBlocksBatchError[] = [];
    for (const input of inputs) {
      const fileName = input.fileName ?? path.basename(input.filePath);
      try {
        const result = await this.parseAndSaveBlocks(input);
        successes.push({
          fileName,
          filePath: input.filePath,
          ...result,
        });
      } catch (error) {
        errors.push(createBatchError(input, classifyStageError(error)));
      }
    }
    return {
      total: inputs.length,
      successCount: successes.length,
      failedCount: errors.length,
      successes,
      errors,
    };
  }
}

export const productConfigAgentBlockParsingService =
  new ProductConfigAgentBlockParsingService();

export async function calculateFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function parseBlocksFromExcel(input: ParseBlocksInput) {
  const parsed = await parseExcelFile({
    filePath: input.filePath,
    fileName: input.fileName ?? path.basename(input.filePath),
    sourceType: "local",
    options: { includeRowBlocks: false, buildLlmText: true },
  });
  if (!parsed.success) {
    throw Object.assign(new Error(parsed.error.message), {
      stage: "productConfigAgent:parseBlocks",
      errorCode: parsed.error.code,
    });
  }
  return parsed.data;
}

function createBatchError(input: ParseBlocksInput, data: {
  stage: string;
  errorCode: string;
  errorMessage: string;
}): ParseBlocksBatchError {
  return {
    fileName: input.fileName ?? path.basename(input.filePath),
    filePath: input.filePath,
    stage: data.stage,
    errorCode: data.errorCode,
    errorMessage: data.errorMessage,
  };
}

function classifyStageError(error: unknown) {
  const record = error && typeof error === "object" ? error as Record<string, unknown> : {};
  return {
    stage: typeof record.stage === "string" ? record.stage : "productConfigAgent:workflow",
    errorCode: typeof record.errorCode === "string" ? record.errorCode : "PRODUCT_CONFIG_AGENT_WORKFLOW_FAILED",
    errorMessage: error instanceof Error ? error.message : String(error),
  };
}
