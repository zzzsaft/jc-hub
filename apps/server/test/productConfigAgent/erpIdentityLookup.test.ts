import assert from "node:assert/strict";
import test from "node:test";
import { buildSalesOrderIdentitySql, ProductConfigErpIdentityLookupService, resolveIdentityItem } from "../../src/modules/productConfigAgent/erpIdentityLookup.service.js";
import { boundProductNumber } from "../../src/modules/productConfigAgent/erpIdentityLedger.service.js";

test("ERP identity lookup refuses broad empty searches", async () => {
  let called = false;
  const service = new ProductConfigErpIdentityLookupService({
    async query() {
      called = true;
      return { fields: [], rows: [], rowCount: 0, truncated: false };
    },
  });

  const result = await service.lookup({});

  assert.equal(called, false);
  assert.deepEqual(result.candidates, []);
  assert.match(result.warnings?.[0] ?? "", /Need product/);
});

test("ERP identity lookup maps order detail evidence", async () => {
  const service = new ProductConfigErpIdentityLookupService({
    async query(options) {
      assert.equal(options.maxRows, 5);
      assert.equal(options.params, undefined);
      assert.match(options.sql, /oh\.OrderNum = 1001/);
      assert.match(options.sql, /od\.PartNum = N'P-1'/);
      return {
        fields: ["orderNumber", "orderLine", "customerId", "customerName", "productNumber", "productName", "prodCode", "prodGroupName", "classId", "className", "hasBom", "quantity", "amount"],
        rows: [[1001, 2, "C01", "ACME China", "P-1", "模头总成", "0910", "平模头", "1010", "模头", 1, 3, 1200]],
        rowCount: 1,
        truncated: false,
      };
    },
  });

  const result = await service.lookup({
    orderNumber: "1001",
    customerText: "ACME",
    productNumber: "P-1",
    itemText: "模头",
    limit: 5,
  });

  assert.equal(result.candidates[0]?.productNumber, "P-1");
  assert.equal(result.candidates[0]?.productName, "模头总成");
  assert.equal(result.candidates[0]?.price, null);
  assert.equal(result.candidates[0]?.prodCode, "0910");
  assert.equal(result.candidates[0]?.hasBom, true);
  assert(result.candidates[0]?.confidence);
});

test("ERP identity SQL safely escapes text because the query backend has no parameter binding", () => {
  const sql = buildSalesOrderIdentitySql({ itemText: "模头%' OR 1=1--" });
  assert.match(sql ?? "", /LIKE N'%模头%'/);
  assert.doesNotMatch(sql ?? "", /OR 1=1/);
  assert.doesNotMatch(sql ?? "", /@itemText/);
  assert.equal(buildSalesOrderIdentitySql({ orderNumber: "not-an-order" }), null);
  assert.equal(buildSalesOrderIdentitySql({ productNumber: "200786,200787" }), null);
});

test("empty normalized item names fall back to raw extraction and then plan", () => {
  assert.deepEqual(
    resolveIdentityItem({ items: [{ item_index: 1, item_name: "" }] }, { extraction: { items: [{ item_index: 1, item_name: "计量泵" }] } }, { items: [{ item_index: 1, item_name: "模头" }] }, 1),
    { item_index: 1, item_name: "计量泵" },
  );
  assert.deepEqual(
    resolveIdentityItem({ items: [{ item_index: 1 }] }, { items: [{ item_index: 1 }] }, { items: [{ item_index: 1, item_name: "连接器" }] }, 1),
    { item_index: 1, item_name: "连接器" },
  );
});

test("document-level inherited and composite product numbers are not item identities", () => {
  assert.equal(boundProductNumber("203434-E", "inherited"), "");
  assert.equal(boundProductNumber("200786,200787", "bound"), "");
  assert.equal(boundProductNumber("203434-E", "bound"), "203434-E");
});

test("ERP package identity links peer products one-to-one", async () => {
  let calls = 0;
  const service = new ProductConfigErpIdentityLookupService({
    async query(options) {
      calls += 1;
      assert.match(options.sql, /oh\.OrderNum = 2001/);
      return {
        fields: ["orderNumber", "orderLine", "productNumber", "productName", "prodCode", "prodGroupName", "classId", "className", "hasBom", "quantity"],
        rows: [
          [2001, 1, "DIE-1", "PET片材模头", "0910", "平模头", "1010", "模头", 1, 1],
          [2001, 2, "PUMP-1", "GD E70计量泵", "0902", "计量泵", "0902", "计量泵", 1, 1],
        ],
        rowCount: 2,
        truncated: false,
      };
    },
  });

  const result = await service.linkPackage({
    orderNumber: 2001,
    items: [
      { itemKey: "die", productName: "PET片材模头", expectedProdCodes: ["0910"], quantity: 1 },
      { itemKey: "pump", productName: "GD-E70计量泵", expectedProdCodes: ["0902"], quantity: 1 },
    ],
  });

  assert.equal(calls, 1);
  assert.deepEqual(result.resolutions.map((item) => [item.itemKey, item.status, item.candidate?.productNumber]), [
    ["die", "matched", "DIE-1"],
    ["pump", "matched", "PUMP-1"],
  ]);
});

test("same PartNum in multiple ERP companies stays ambiguous until company is known", async () => {
  const service = new ProductConfigErpIdentityLookupService({
    async query() {
      return {
        fields: ["company", "productNumber", "productName", "prodCode", "hasBom"],
        rows: [
          ["A", "P-1", "平模头", "0910", 1],
          ["B", "P-1", "平模头", "0910", 0],
        ],
        rowCount: 2,
        truncated: false,
      };
    },
  });

  const ambiguous = await service.linkPackage({ items: [{ itemKey: "die", productName: "平模头", productNumber: "P-1" }] });
  assert.equal(ambiguous.resolutions[0]?.status, "ambiguous");
  const matched = await service.linkPackage({ items: [{ itemKey: "die", company: "A", productName: "平模头", productNumber: "P-1" }] });
  assert.equal(matched.resolutions[0]?.status, "matched");
  assert.equal(matched.resolutions[0]?.candidate?.company, "A");
  assert.equal(matched.resolutions[0]?.candidate?.hasBom, true);
});

test("name and ERP family hints alone never claim a matched identity", async () => {
  const service = new ProductConfigErpIdentityLookupService({
    async query() {
      return {
        fields: ["company", "productNumber", "productName", "prodCode", "hasBom"],
        rows: [["A", "DIE-1", "PET片材模头", "0910", 1]],
        rowCount: 1,
        truncated: false,
      };
    },
  });

  const result = await service.linkPackage({
    items: [{ itemKey: "die", productName: "PET片材模头", expectedProdCodes: ["0910"] }],
  });

  assert.equal(result.resolutions[0]?.status, "ambiguous");
  assert.ok(result.resolutions[0]?.reasons.includes("name_or_family_hint_only"));
});
