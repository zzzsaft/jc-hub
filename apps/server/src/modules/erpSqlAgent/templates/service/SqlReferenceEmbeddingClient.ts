import OpenAI from "openai";
import { finishLlmCallLog, startLlmCallLog } from "../../../../ai/llm/llmCallLogger.js";

export const DEFAULT_SQL_REFERENCE_EMBEDDING_MODEL = "text-embedding-3-small";
export const SQL_REFERENCE_EMBEDDING_PURPOSE = "erp_sql_reference_embedding";

export type SqlReferenceEmbeddingClient = {
  model: string;
  embed(texts: string[]): Promise<number[][]>;
};

export function createSqlReferenceEmbeddingClientFromEnv(options: {
  model?: string;
  required?: boolean;
} = {}): SqlReferenceEmbeddingClient | null {
  const apiKey = process.env.ERP_SQL_EMBEDDING_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    if (options.required) throw new Error("Missing ERP_SQL_EMBEDDING_API_KEY or OPENAI_API_KEY");
    return null;
  }
  const model = options.model?.trim() || process.env.ERP_SQL_EMBEDDING_MODEL || DEFAULT_SQL_REFERENCE_EMBEDDING_MODEL;
  const openai = new OpenAI({
    apiKey,
    baseURL: process.env.ERP_SQL_EMBEDDING_BASE_URL || undefined,
  });
  return {
    model,
    async embed(texts: string[]) {
      const log = await startLlmCallLog({
        provider: "openai-compatible",
        model,
        purpose: SQL_REFERENCE_EMBEDDING_PURPOSE,
        input: { batchSize: texts.length, model },
      });
      try {
        const response = await openai.embeddings.create({ model, input: texts });
        const vectors = response.data
          .slice()
          .sort((left, right) => left.index - right.index)
          .map((item) => item.embedding);
        const dim = vectors[0]?.length ?? 0;
        await finishLlmCallLog(log, { output: { batchSize: texts.length, model, dim } });
        return vectors;
      } catch (error) {
        await finishLlmCallLog(log, { error });
        throw error;
      }
    },
  };
}
