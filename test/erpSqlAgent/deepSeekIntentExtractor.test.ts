import assert from "node:assert/strict";
import test from "node:test";
import { DeepSeekIntentExtractor, type DeepSeekIntentRequester } from "../../src/modules/erpSqlAgent/intent/index.js";

test("DeepSeek intent extractor parses validated JSON", async () => {
  const requester: DeepSeekIntentRequester = async () =>
    JSON.stringify({
      originalQuestion: "查询最近30天物料 A123 的库存交易",
      normalizedQuestion: "查询最近30天物料 A123 的库存交易",
      module: "inventory",
      intentType: "trace",
      entities: { partNum: "A123" },
      dateRange: { relativeDays: 30, label: "最近30天" },
      confidence: 0.92,
      warnings: [],
    });
  const extractor = new DeepSeekIntentExtractor(requester);

  const result = await extractor.extract("查询最近30天物料 A123 的库存交易");

  assert.equal(result.module, "inventory");
  assert.equal(result.entities.partNum, "A123");
  assert.equal(result.dateRange?.relativeDays, 30);
});

test("DeepSeek intent extractor rejects invalid JSON shape", async () => {
  const requester: DeepSeekIntentRequester = async () =>
    JSON.stringify({
      originalQuestion: "x",
      normalizedQuestion: "x",
      module: "inventory",
      entities: {},
      confidence: 2,
      warnings: [],
    });
  const extractor = new DeepSeekIntentExtractor(requester);

  await assert.rejects(() => extractor.extract("x"), /Too big|less than or equal/);
});
