import assert from "node:assert/strict";
import test from "node:test";
import { collectMetricFieldRefsForAudit } from "../../src/modules/erpSqlAgent/scripts/auditApprovedMetricSqlGuard.js";

test("approved metric audit ignores schema.table and keeps table.field references", () => {
  const refs = collectMetricFieldRefsForAudit({
    familyId: "family_order",
    metricCode: "order_amount",
    metricName: "订单金额",
    businessDescription: "销售订单金额",
    calculationSummary: "按产品统计订单金额",
    coreTables: ["Erp.OrderDtl"],
    coreJoins: ["JOIN Erp.OrderHed OrderHed ON OrderDtl.Company = OrderHed.Company"],
    params: [],
    definitionJson: {
      kind: "atomic_metric",
      requiredTables: ["Erp.OrderDtl"],
      amountExpression: "OrderDtl.DocExtPriceDtl",
      dimensionExpressions: { product: "OrderHed.ShortChar01" },
    },
    representativeSql: null,
  });

  assert.deepEqual(refs.map((ref) => `${ref.qualifier}.${ref.fieldName}`), [
    "OrderDtl.DocExtPriceDtl",
    "OrderHed.ShortChar01",
    "OrderDtl.Company",
    "OrderHed.Company",
  ]);
});
