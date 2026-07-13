import type {
  ComplexQueryComposedResult,
  ComplexQueryPlan,
  ComplexQueryStepId,
  ComplexQueryStepResult,
} from "./types.js";

const OUTPUT_FIELDS: ComplexQueryComposedResult["fields"] = [
  "Company", "product", "sales_growth_rate", "inventory_on_hand_qty", "open_shipping_qty", "open_shipping_amount",
];

type SalesAnchor = { company: string; product: string; growth: number | null };

export class ComplexQueryResultComposer {
  compose(plan: ComplexQueryPlan, steps: ComplexQueryStepResult[]): ComplexQueryComposedResult {
    if (plan.joinPolicy.allowNameBasedJoin || plan.joinPolicy.keys.join("|") !== "Company|product") {
      throw new Error("unapproved_complex_join_policy");
    }
    const byId = new Map(steps.map((step) => [step.id, step]));
    const sales = requireUsable(byId.get("sales_growth"), "sales_growth");
    const anchors = salesAnchors(sales);
    const inventory = metricMap(byId.get("inventory"), "inventory", ["inventory_on_hand_qty"]);
    const backlog = metricMap(byId.get("backlog"), "backlog", ["open_shipping_qty", "open_shipping_amount"]);
    const rows = anchors
      .map((anchor) => {
        const key = joinKey(anchor.company, anchor.product);
        return [
          anchor.company,
          anchor.product,
          anchor.growth,
          inventory.get(key)?.[0] ?? null,
          backlog.get(key)?.[0] ?? null,
          backlog.get(key)?.[1] ?? null,
        ];
      })
      .sort((left, right) => compareGrowthDescending(left[2], right[2]));
    const matchedRows = anchors.filter((anchor) => {
      const key = joinKey(anchor.company, anchor.product);
      return inventory.has(key) && backlog.has(key);
    }).length;
    const anchorRows = anchors.length;
    const joinCoverage = {
      anchorRows,
      matchedRows,
      unmatchedRows: anchorRows - matchedRows,
      coverageRate: anchorRows === 0 ? 1 : matchedRows / anchorRows,
    };
    const warnings = [
      ...steps.flatMap((step) => step.warnings),
      ...(joinCoverage.unmatchedRows > 0 ? [`complex_join_unmatched:${joinCoverage.unmatchedRows}`] : []),
    ];
    return {
      status: joinCoverage.unmatchedRows === 0 && steps.every((step) => step.status === "completed") ? "completed" : "partial",
      fields: OUTPUT_FIELDS,
      rows,
      rowCount: rows.length,
      truncated: steps.some((step) => step.truncated),
      warnings: [...new Set(warnings)],
      joinCoverage,
    };
  }
}

function salesAnchors(step: ComplexQueryStepResult): SalesAnchor[] {
  const companyIndex = fieldIndex(step, "Company");
  const productIndex = fieldIndex(step, "product");
  const periodIndex = fieldIndex(step, "period");
  const amountIndex = fieldIndex(step, "order_amount");
  const periodsByKey = new Map<string, Map<string, number>>();
  for (const row of step.rows) {
    const company = requiredKey(row[companyIndex], step.id);
    const product = requiredKey(row[productIndex], step.id);
    const period = requiredKey(row[periodIndex], step.id);
    const amount = numberValue(row[amountIndex]);
    const key = joinKey(company, product);
    const periods = periodsByKey.get(key) ?? new Map<string, number>();
    if (periods.has(period)) throw new Error(`duplicate_join_key:${step.id}:${key}:${period}`);
    if (amount !== null) periods.set(period, amount);
    periodsByKey.set(key, periods);
  }
  return [...periodsByKey.entries()].map(([key, periods]) => {
    const [company, product] = splitJoinKey(key);
    const values = [...periods.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, amount]) => amount);
    const earliest = values[0];
    const latest = values.at(-1);
    const growth = values.length >= 2 && earliest !== undefined && earliest !== 0 && latest !== undefined
      ? (latest - earliest) / Math.abs(earliest)
      : null;
    return { company, product, growth };
  });
}

function metricMap(step: ComplexQueryStepResult | undefined, id: ComplexQueryStepId, metrics: string[]): Map<string, Array<number | null>> {
  if (!step || !["completed", "partial"].includes(step.status)) return new Map();
  const companyIndex = fieldIndex(step, "Company");
  const productIndex = fieldIndex(step, "product");
  const metricIndexes = metrics.map((metric) => fieldIndex(step, metric));
  const result = new Map<string, Array<number | null>>();
  for (const row of step.rows) {
    const company = requiredKey(row[companyIndex], id);
    const product = requiredKey(row[productIndex], id);
    const key = joinKey(company, product);
    if (result.has(key)) throw new Error(`duplicate_join_key:${id}:${key}`);
    result.set(key, metricIndexes.map((index) => numberValue(row[index])));
  }
  return result;
}

function requireUsable(step: ComplexQueryStepResult | undefined, id: ComplexQueryStepId): ComplexQueryStepResult {
  if (!step || !["completed", "partial"].includes(step.status)) throw new Error(`missing_anchor_step:${id}`);
  return step;
}

function fieldIndex(step: ComplexQueryStepResult, field: string): number {
  const index = step.fields.indexOf(field);
  if (index < 0) throw new Error(`missing_result_field:${step.id}:${field}`);
  return index;
}

function requiredKey(value: unknown, id: ComplexQueryStepId): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`missing_join_key:${id}`);
  return value.trim();
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function joinKey(company: string, product: string): string {
  return `${company}\u0000${product}`;
}

function splitJoinKey(key: string): [string, string] {
  const [company = "", product = ""] = key.split("\u0000", 2);
  return [company, product];
}

function compareGrowthDescending(left: unknown, right: unknown): number {
  const leftNumber = numberValue(left);
  const rightNumber = numberValue(right);
  if (leftNumber === null) return rightNumber === null ? 0 : 1;
  if (rightNumber === null) return -1;
  return rightNumber - leftNumber;
}
