import assert from "node:assert/strict";
import test from "node:test";
import { createSqlReferenceEmbeddingClientFromEnv } from "../../src/modules/erpSqlAgent/templates/service/SqlReferenceEmbeddingClient.js";

test("SQL reference embedding client requires key and trusted endpoint", () => {
  const originalKey = process.env.ERP_SQL_EMBEDDING_API_KEY;
  const originalOpenAiKey = process.env.OPENAI_API_KEY;
  const originalTrusted = process.env.ERP_SQL_EMBEDDING_TRUSTED;
  try {
    delete process.env.ERP_SQL_EMBEDDING_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ERP_SQL_EMBEDDING_TRUSTED;
    assert.throws(() => createSqlReferenceEmbeddingClientFromEnv({ required: true }), /Missing ERP_SQL_EMBEDDING_API_KEY/);

    process.env.ERP_SQL_EMBEDDING_API_KEY = "test-key";
    assert.equal(createSqlReferenceEmbeddingClientFromEnv(), null);
    assert.throws(() => createSqlReferenceEmbeddingClientFromEnv({ required: true }), /unconfirmed embedding endpoint/);

    process.env.ERP_SQL_EMBEDDING_TRUSTED = "1";
    assert(createSqlReferenceEmbeddingClientFromEnv());
  } finally {
    restoreEnv("ERP_SQL_EMBEDDING_API_KEY", originalKey);
    restoreEnv("OPENAI_API_KEY", originalOpenAiKey);
    restoreEnv("ERP_SQL_EMBEDDING_TRUSTED", originalTrusted);
  }
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
