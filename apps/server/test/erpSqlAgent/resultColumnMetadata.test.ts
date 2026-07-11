import assert from "node:assert/strict";
import test from "node:test";
import { buildResultColumns } from "../../src/modules/erpSqlAgent/agent/resultColumnMetadata.js";

test("result columns expose generic display metadata for comparison output", () => {
  const columns = buildResultColumns(
    ["产品类别", "上月销售额", "去年同期销售额", "同比差额", "同比率", "时间字段"],
    [["平模头", 100, 80, 20, 0.25, "OrderHed.OrderDate"]],
  );

  assert.deepEqual(columns.map((column) => column.label), ["产品类别", "上月销售额", "去年同期销售额", "同比差额", "同比率", "时间字段"]);
  assert.deepEqual(columns.map((column) => column.dataType), ["text", "money", "money", "money", "percent", "date"]);
  assert.equal(columns[4]?.format.percent, true);
  assert.equal(columns[5]?.role, "technical");
  assert.equal(columns[5]?.inlineVisible, false);
});

test("legacy generic fields derive labels from final SQL select aliases", () => {
  const columns = buildResultColumns(
    ["Column1", "Column2"],
    [["平模头", 100]],
    "SELECT ProdGrup.Description AS [产品类别], SUM(OrderDtl.DocExtPriceDtl) AS [销售额] FROM Erp.OrderDtl",
  );

  assert.deepEqual(columns.map((column) => column.label), ["产品类别", "销售额"]);
  assert.deepEqual(columns.map((column) => column.key), ["产品类别", "销售额"]);
  assert.deepEqual(columns.map((column) => column.dataType), ["text", "money"]);
});

test("structured metric aliases derive business labels without frontend field rules", () => {
  const columns = buildResultColumns(
    ["product_category", "order_amount", "order_amount_comparison", "order_amount_change", "order_amount_change_rate"],
    [["平模头", 100, 80, 20, 0.25]],
  );

  assert.deepEqual(columns.map((column) => column.label), ["产品类别", "销售订单金额", "销售订单金额（比较期）", "销售订单金额差额", "销售订单金额变化率"]);
});

test("structured comparison labels name the resolved June periods", () => {
  const columns = buildResultColumns(
    ["order_amount", "order_amount_comparison"],
    [[100, 80]],
    "",
    { timeRange: { kind: "month", month: 6 }, comparison: { kind: "year_over_year" } },
    new Date("2026-07-11T12:00:00+08:00"),
  );

  assert.deepEqual(columns.map((column) => column.label), ["2026年6月销售订单金额", "2025年6月销售订单金额"]);
});

test("previous-month comparison labels cross the year boundary", () => {
  const columns = buildResultColumns(
    ["order_amount", "order_amount_comparison"],
    [[100, 80]],
    "",
    { timeRange: { kind: "previous_month" }, comparison: { kind: "year_over_year" } },
    new Date("2026-01-15T12:00:00+08:00"),
  );

  assert.deepEqual(columns.map((column) => column.label), ["2025年12月销售订单金额", "2024年12月销售订单金额"]);
});
