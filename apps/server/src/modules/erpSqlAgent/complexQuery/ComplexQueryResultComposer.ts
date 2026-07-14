import type {
  ComplexQueryComposedResult,
  ComplexQueryPlan,
  ComplexQueryStep,
  ComplexQueryStepResult,
} from "./types.js";

type NormalizedResult = Pick<ComplexQueryStepResult, "id" | "fields" | "rows">;

export class ComplexQueryResultComposer {
  compose(plan: ComplexQueryPlan, results: ComplexQueryStepResult[]): ComplexQueryComposedResult {
    if (plan.joinPolicy.allowNameBasedJoin) throw new Error("unapproved_complex_join_policy");
    const byId = new Map(results.map((result) => [result.id, result]));
    const anchorStep = plan.steps.find((step) => step.dependsOn.length === 0 && usable(byId.get(step.id)));
    if (!anchorStep) throw new Error("missing_anchor_step");
    const anchor = normalizeAnchor(plan, requireResult(byId.get(anchorStep.id)));
    assertUnique(anchor, commonKeys(plan, anchor.fields, anchor.fields));

    let fields = [...anchor.fields];
    let rows = anchor.rows.map((row) => [...row]);
    const joinCoverage: ComplexQueryComposedResult["joinCoverage"] = [];
    const warnings = results.flatMap((result) => result.warnings);

    for (const dependent of plan.steps.filter((step) => step.dependsOn.length > 0)) {
      const result = byId.get(dependent.id);
      const keys = result ? commonKeys(plan, anchor.fields, result.fields) : [];
      const coverage = joinDependent(anchor, rows, fields, dependent, result, keys);
      fields = coverage.fields;
      rows = coverage.rows;
      joinCoverage.push(coverage.joinCoverage);
    }

    if (plan.scenario === "product_sales_inventory_backlog_trend") {
      const growthIndex = fields.indexOf("sales_growth_rate");
      rows.sort((left, right) => compareNumbersDescending(left[growthIndex], right[growthIndex]));
    }
    rows = rows.slice(0, plan.resultLimit);
    const visibleKeys = new Set(rows.map((row) => exactJoinKey(row, anchor.fields, plan.joinPolicy.keys)));
    for (const coverage of joinCoverage) {
      const joined = byId.get(coverage.stepId);
      const joinedKeys = joined && coverage.keys.length > 0 ? resultKeys(joined, coverage.keys) : new Set<string>();
      const visibleAnchors = anchor.rows.filter((row) => visibleKeys.has(exactJoinKey(row, anchor.fields, plan.joinPolicy.keys)));
      coverage.anchorRows = visibleAnchors.length;
      coverage.matchedRows = visibleAnchors.filter((row) => joinedKeys.has(exactJoinKey(row, anchor.fields, coverage.keys))).length;
      coverage.unmatchedRows = coverage.anchorRows - coverage.matchedRows;
      coverage.coverageRate = coverage.anchorRows === 0 ? 0 : coverage.matchedRows / coverage.anchorRows;
    }
    warnings.push(...joinCoverage
      .filter((item) => item.unmatchedRows > 0)
      .map((item) => `complex_join_unmatched:${item.stepId}:${item.unmatchedRows}`));
    const partial = results.some((result) => result.status !== "completed") || joinCoverage.some((item) => item.unmatchedRows > 0);
    return {
      status: partial ? "partial" : "completed",
      fields,
      rows,
      rowCount: rows.length,
      truncated: results.some((result) => result.truncated),
      warnings: [...new Set(warnings)],
      joinCoverage,
    };
  }
}

function joinDependent(
  anchor: NormalizedResult,
  currentRows: unknown[][],
  currentFields: string[],
  step: ComplexQueryStep,
  result: ComplexQueryStepResult | undefined,
  keys: string[],
) {
  const outputFields = usable(result) && keys.length > 0
    ? result.fields.filter((field) => !keys.includes(field)).map((field) => currentFields.includes(field) ? `${step.id}.${field}` : field)
    : [];
  if (!usable(result) || keys.length === 0) {
    return {
      fields: currentFields,
      rows: currentRows,
      joinCoverage: coverage(step.id, keys, anchor.rows.length, 0),
    };
  }
  assertUnique(result, keys);
  const keyIndexes = keys.map((key) => fieldIndex(result, key));
  const valueIndexes = result.fields.map((field, index) => ({ field, index })).filter(({ field }) => !keys.includes(field));
  const indexed = new Map(result.rows.map((row) => [joinKey(keyIndexes.map((index) => requiredKey(row[index], result.id))), row]));
  let matchedRows = 0;
  const rows = currentRows.map((row) => {
    const match = indexed.get(exactJoinKey(row, anchor.fields, keys));
    if (match) matchedRows += 1;
    return [...row, ...valueIndexes.map(({ index }) => match?.[index] ?? null)];
  });
  return { fields: [...currentFields, ...outputFields], rows, joinCoverage: coverage(step.id, keys, anchor.rows.length, matchedRows) };
}

function normalizeAnchor(plan: ComplexQueryPlan, result: ComplexQueryStepResult): NormalizedResult {
  if (plan.scenario !== "product_sales_inventory_backlog_trend") return result;
  if (result.fields.includes("sales_growth_rate")) {
    const companyIndex = fieldIndex(result, "Company");
    const productIndex = fieldIndex(result, "product");
    const growthIndex = fieldIndex(result, "sales_growth_rate");
    return {
      id: result.id,
      fields: ["Company", "product", "sales_growth_rate"],
      rows: result.rows.map((row) => [
        requiredKey(row[companyIndex], result.id),
        requiredKey(row[productIndex], result.id),
        numberValue(row[growthIndex]),
      ]),
    };
  }
  const companyIndex = fieldIndex(result, "Company");
  const productIndex = fieldIndex(result, "product");
  const periodIndex = fieldIndex(result, "period");
  const amountIndex = fieldIndex(result, "order_amount");
  const periodsByKey = new Map<string, { keys: unknown[]; periods: Map<string, number>; seenPeriods: Set<string> }>();
  for (const row of result.rows) {
    const keys = [requiredKey(row[companyIndex], result.id), requiredKey(row[productIndex], result.id)];
    const period = requiredKey(row[periodIndex], result.id);
    const entry = periodsByKey.get(joinKey(keys)) ?? { keys, periods: new Map(), seenPeriods: new Set() };
    if (entry.seenPeriods.has(period)) throw new Error(`duplicate_join_key:${result.id}:${joinKey([...keys, period])}`);
    entry.seenPeriods.add(period);
    const amount = numberValue(row[amountIndex]);
    if (amount !== null) entry.periods.set(period, amount);
    periodsByKey.set(joinKey(keys), entry);
  }
  return {
    id: result.id,
    fields: ["Company", "product", "sales_growth_rate"],
    rows: [...periodsByKey.values()].map(({ keys, periods }) => {
      const values = [...periods].sort(([left], [right]) => left.localeCompare(right)).map(([, value]) => value);
      const [first, last] = [values[0], values.at(-1)];
      return [...keys, values.length >= 2 && first !== undefined && first !== 0 && last !== undefined ? (last - first) / Math.abs(first) : null];
    }),
  };
}

function assertUnique(result: NormalizedResult, keys: string[]): void {
  if (keys.length === 0) throw new Error(`missing_join_keys:${result.id}`);
  const indexes = keys.map((key) => fieldIndex(result, key));
  const seen = new Set<string>();
  for (const row of result.rows) {
    const key = joinKey(indexes.map((index) => requiredKey(row[index], result.id)));
    if (seen.has(key)) throw new Error(`duplicate_join_key:${result.id}:${key}`);
    seen.add(key);
  }
}

function resultKeys(result: ComplexQueryStepResult, keys: string[]): Set<string> {
  if (!usable(result) || keys.length === 0) return new Set();
  const indexes = keys.map((key) => fieldIndex(result, key));
  return new Set(result.rows.map((row) => joinKey(indexes.map((index) => requiredKey(row[index], result.id)))));
}

function commonKeys(plan: ComplexQueryPlan, left: string[], right: string[]): string[] {
  return plan.joinPolicy.keys.filter((key) => left.includes(key) && right.includes(key));
}

function exactJoinKey(row: unknown[], fields: string[], keys: string[]): string {
  return joinKey(keys.map((key) => requiredKey(row[fieldIndex({ id: "anchor", fields }, key)], "anchor")));
}

function fieldIndex(result: Pick<ComplexQueryStepResult, "id" | "fields">, field: string): number {
  const index = result.fields.indexOf(field);
  if (index < 0) throw new Error(`missing_result_field:${result.id}:${field}`);
  return index;
}

function requiredKey(value: unknown, id: string): string {
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  throw new Error(`missing_join_key:${id}`);
}

function joinKey(values: unknown[]): string {
  return values.map(String).join("\u0000");
}

function coverage(stepId: string, keys: string[], anchorRows: number, matchedRows: number) {
  return { stepId, keys, anchorRows, matchedRows, unmatchedRows: anchorRows - matchedRows, coverageRate: anchorRows === 0 ? 0 : matchedRows / anchorRows };
}

function usable(result: ComplexQueryStepResult | undefined): result is ComplexQueryStepResult {
  return Boolean(result && ["completed", "partial"].includes(result.status));
}

function requireResult(result: ComplexQueryStepResult | undefined): ComplexQueryStepResult {
  if (!result) throw new Error("missing_anchor_step");
  return result;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function compareNumbersDescending(left: unknown, right: unknown): number {
  const leftNumber = numberValue(left);
  const rightNumber = numberValue(right);
  if (leftNumber === null) return rightNumber === null ? 0 : 1;
  if (rightNumber === null) return -1;
  return rightNumber - leftNumber;
}
