import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPurchaseApplyPreview,
  parsePurchaseApplyFilters,
  validatePurchaseApplyRows,
} from "../../src/modules/purchaseApply/service.js";
import type { PurchaseApplyRow } from "../../src/modules/purchaseApply/types.js";

test("parsePurchaseApplyFilters keeps only supported area and defaults demandOnly", () => {
  assert.deepEqual(
    parsePurchaseApplyFilters({ area: "未知" as never, demandOnly: undefined }),
    {
      partNum: "",
      partDescription: "",
      jobNum: "",
      createdFrom: "",
      createdTo: "",
      requiredFrom: "",
      requiredTo: "",
      area: "",
      demandOnly: true,
      cycleFrom: "",
      cycleTo: "",
      batchArrivalDate: "",
    },
  );
  assert.equal(parsePurchaseApplyFilters({ area: "澄江", demandOnly: false }).area, "澄江");
  assert.equal(parsePurchaseApplyFilters({ area: "澄江", demandOnly: false }).demandOnly, false);
});

test("validatePurchaseApplyRows catches ERP write fields", () => {
  const errors = validatePurchaseApplyRows([{ ...row(), applyNum: "", orderQty: 0 }]);
  assert(errors.includes("rows[0].orderQty must be greater than 0"));
  assert(errors.includes("rows[0].applyNum is required for ERP write"));
});

test("buildPurchaseApplyPreview groups rows by vendor and maps PoKCCreate payload shape", () => {
  const result = buildPurchaseApplyPreview({
    buyerId: "B01",
    orderDate: "2026-07-08",
    taxRegionCode: "CN13",
    userId: "u1",
    rows: [
      row({ id: "1", vendorId: "V001", applyLine: "1", orderQty: 2 }),
      row({ id: "2", vendorId: "V001", applyLine: "2", orderQty: 3 }),
      row({ id: "3", vendorId: "V002", applyLine: "1", orderQty: 4 }),
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.groups.length, 2);
  assert.deepEqual(
    result.groups.map((group) => [group.vendorId, group.details.length]),
    [
      ["V001", 2],
      ["V002", 1],
    ],
  );
  assert.deepEqual(result.groups[0].details[0], {
    partNum: "M-1",
    ourQty: 2,
    vendQty: 2,
    pieces: 2,
    ium: "pcs",
    pum: "pcs",
    dueDate: "2026-07-20",
    commentText: "备注",
    baseType: 0,
    cpNum: "CP-1",
    applyNum: "AP-1",
    applyLine: "1",
    area: "总厂",
    price: undefined,
    maxPrice: undefined,
    minPrice: undefined,
  });
});

function row(patch: Partial<PurchaseApplyRow> = {}): PurchaseApplyRow {
  return {
    id: "1",
    selected: true,
    operated: false,
    partNum: "M-1",
    partDescription: "物料",
    needDrawing: false,
    smallBatch: false,
    requiredQty: 2,
    orderQty: 2,
    monthlyUsage: 0,
    unit: "pcs",
    arrivalDate: "2026-07-20",
    packageSpec: 1,
    pieces: 2,
    purchaseCycle: 0,
    area: "总厂",
    stockLevel: "需求",
    remark: "备注",
    stockQty: 0,
    supplierName: "供应商",
    vendorId: "V001",
    vendorNum: "8001",
    applyNum: "AP-1",
    applyLine: "1",
    baseType: 0,
    cpNum: "CP-1",
    ...patch,
  };
}
