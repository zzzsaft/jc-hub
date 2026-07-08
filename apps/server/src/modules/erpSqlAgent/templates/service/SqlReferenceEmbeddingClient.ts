import OpenAI from "openai";
import { request as httpsRequest } from "node:https";
import httpsProxyAgent from "https-proxy-agent";
import { finishLlmCallLog, startLlmCallLog } from "../../../../ai/llm/llmCallLogger.js";

export const DEFAULT_SQL_REFERENCE_EMBEDDING_MODEL = "text-embedding-3-small";
export const SQL_REFERENCE_EMBEDDING_PURPOSE = "erp_sql_reference_embedding";
const { HttpsProxyAgent } = httpsProxyAgent;

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
  if (!isTrustedEmbeddingEndpoint()) {
    if (options.required) throw new Error("Refusing to send ERP SQL reference text to an unconfirmed embedding endpoint. Set ERP_SQL_EMBEDDING_TRUSTED=1 after confirming the endpoint is approved for this data.");
    return null;
  }
  const model = options.model?.trim() || process.env.ERP_SQL_EMBEDDING_MODEL || DEFAULT_SQL_REFERENCE_EMBEDDING_MODEL;
  const baseURL = process.env.ERP_SQL_EMBEDDING_BASE_URL || undefined;
  const proxyURL = getProxyUrl();
  const openai = new OpenAI({
    apiKey,
    baseURL,
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
        const vectors = proxyURL
          ? await requestEmbeddingsViaProxy({ apiKey, baseURL, model, texts, proxyURL })
          : await requestEmbeddings(openai, model, texts);
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

function isTrustedEmbeddingEndpoint(): boolean {
  return /^(1|true|yes)$/iu.test(process.env.ERP_SQL_EMBEDDING_TRUSTED?.trim() ?? "");
}

async function requestEmbeddings(openai: OpenAI, model: string, texts: string[]): Promise<number[][]> {
  const response = await openai.embeddings.create({ model, input: texts });
  return response.data
    .slice()
    .sort((left, right) => left.index - right.index)
    .map((item) => item.embedding);
}

function getProxyUrl(): string | undefined {
  return process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY
    || process.env.https_proxy || process.env.http_proxy || process.env.all_proxy;
}

function requestEmbeddingsViaProxy(params: {
  apiKey: string;
  baseURL?: string;
  model: string;
  texts: string[];
  proxyURL: string;
}): Promise<number[][]> {
  const url = new URL("/v1/embeddings", params.baseURL || "https://api.openai.com/v1");
  const body = JSON.stringify({ model: params.model, input: params.texts });
  return new Promise((resolve, reject) => {
    const request = httpsRequest(url, {
      method: "POST",
      agent: new HttpsProxyAgent(params.proxyURL) as any,
      headers: {
        "Authorization": `Bearer ${params.apiKey}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      response.on("end", () => {
        const content = Buffer.concat(chunks).toString("utf8");
        if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`Embedding request failed: HTTP ${response.statusCode ?? "unknown"} ${content.slice(0, 300)}`));
          return;
        }
        try {
          const parsed = JSON.parse(content) as { data?: Array<{ index: number; embedding: number[] }> };
          resolve((parsed.data ?? []).slice().sort((left, right) => left.index - right.index).map((item) => item.embedding));
        } catch (error) {
          reject(error);
        }
      });
    });
    request.setTimeout(120000, () => request.destroy(new Error("Embedding request timed out")));
    request.on("error", reject);
    request.end(body);
  });
}
