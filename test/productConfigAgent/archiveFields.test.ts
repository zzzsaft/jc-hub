import assert from "node:assert/strict";
import test from "node:test";
import {
  summarizeArchiveColumns,
  summarizeArchiveItems,
} from "../../src/productConfigAgent/archive/archiveFields.js";

test("summarizeArchiveColumns extracts legacy document info columns", () => {
  const summary = summarizeArchiveColumns({
    document_info: {
      product_number: { value: " PN-001 " },
      contract_number: { value: "HT-001" },
      order_number: "SO-001",
      customer_id: { raw_value: "CUST-001" },
      country: "CN",
      order_date: "2026-06-01",
      delivery_date: "2026-07-01",
    },
  });

  assert.equal(summary.productNumber, "PN-001");
  assert.equal(summary.contractNumber, "HT-001");
  assert.equal(summary.orderNumber, "SO-001");
  assert.equal(summary.customerId, "CUST-001");
  assert.equal(summary.country, "CN");
  assert.equal(summary.orderDate?.toISOString().slice(0, 10), "2026-06-01");
  assert.equal(summary.deliveryDate?.toISOString().slice(0, 10), "2026-07-01");
  assert.deepEqual(summary.docInfo, {
    product_number: { value: " PN-001 " },
    contract_number: { value: "HT-001" },
    order_number: "SO-001",
    customer_id: { raw_value: "CUST-001" },
    country: "CN",
    order_date: "2026-06-01",
    delivery_date: "2026-07-01",
  });
});

test("summarizeArchiveItems stores product type and product number binding columns", () => {
  const items = summarizeArchiveItems({
    document_info: { product_number: { value: "PN-002" } },
    items: [
      {
        item_index: 0,
        item_name: "A",
        item_quantity: "2",
        itemProductTypeHint: { value: "flat_die", raw_value: "模头", display_name: "模头" },
        fields: [{ field_name: "功率", value: "10kW" }],
      },
      {
        item_index: 1,
        item_name: "B",
        product_type_hint: "pump",
        raw_fields: [{ field_name: "型号", value: "P-1" }],
      },
    ],
  });

  assert.equal(items.length, 2);
  assert.equal(items[0].productTypeHint, "flat_die");
  assert.equal(items[0].productTypeRawValue, "模头");
  assert.equal(items[0].productTypeDisplayName, "模头");
  assert.equal(items[0].sourceProductNumber, "PN-002");
  assert.equal(items[0].productNumberStatus, "inherited");
  assert.deepEqual(items[0].fieldsJson, [{ field_name: "功率", value: "10kW" }]);
  assert.equal(items[1].productTypeHint, "pump");
  assert.equal(items[1].sourceProductNumber, "PN-002");
});
