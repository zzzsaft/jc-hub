export type ErpSqlResultColumn = {
  key: string;
  label: string;
  dataType: "text" | "money" | "percent" | "date" | "integer";
  format: {
    decimals?: number;
    percent?: boolean;
    currencyUnit?: string;
  };
  role: "dimension" | "metric" | "technical";
  inlineVisible: boolean;
};

type ResultPeriodPlan = { timeRange?: { kind?: string; month?: number }; comparison?: { kind?: string } };

export function buildResultColumns(fields: string[], rows: unknown[][] = [], sql = "", plan?: ResultPeriodPlan, now = new Date()): ErpSqlResultColumn[] {
  const aliases = selectAliases(sql, fields.length);
  const used = new Set<string>();
  return fields.map((field, index) => {
    const alias = isGenericField(field) ? aliases[index] ?? field : field;
    const key = uniqueKey(stableKey(alias || field, index), used);
    const role = columnRole(alias);
    const dataType = columnDataType(alias, rows.map((row) => row[index]));
    return {
      key,
      label: periodAwareLabel(alias || field, plan, now),
      dataType,
      format: dataType === "money"
        ? { decimals: 2, currencyUnit: "原币" }
        : dataType === "percent"
          ? { decimals: 2, percent: true }
          : dataType === "integer" ? { decimals: 0 } : {},
      role,
      inlineVisible: role !== "technical",
    };
  });
}

function periodAwareLabel(field: string, plan: ResultPeriodPlan | undefined, now: Date): string {
  if (!plan?.comparison || !/^order_amount(?:_comparison)?$/iu.test(field)) return readableLabel(field);
  const comparison = /_comparison$/iu.test(field);
  const year = now.getFullYear() - (comparison ? 1 : 0);
  const month = plan.timeRange?.kind === "month" ? plan.timeRange.month
    : plan.timeRange?.kind === "previous_month" ? (now.getMonth() || 12)
      : undefined;
  if (month) return `${year}年${month}月销售订单金额`;
  if (plan.timeRange?.kind === "current_year" || plan.timeRange?.kind === "year_over_year") {
    return comparison ? `${year}年同期销售订单金额` : `${year}年截至${now.getMonth() + 1}月${now.getDate()}日销售订单金额`;
  }
  return readableLabel(field);
}

function columnRole(field: string): ErpSqlResultColumn["role"] {
  if (/时间字段|金额字段|状态过滤|税退款口径|分类合并规则|分类规则验证|口径|filter|policy/iu.test(field)) return "technical";
  if (/company|customer|product|category|order|supplier|warehouse|division|period|公司|客户|产品|类别|订单|供应商|仓库|事业部|期间|年份|月份/iu.test(field)) return "dimension";
  return "metric";
}

function columnDataType(field: string, values: unknown[]): ErpSqlResultColumn["dataType"] {
  if (/率|占比|percent|percentage|rate|ratio/iu.test(field)) return "percent";
  if (/金额|销售额|接单额|收入|成本|毛利|差额|amount|revenue|cost|price|balance|total/iu.test(field)) return "money";
  if (/日期|时间|date|period|年份|月份/iu.test(field)) return "date";
  if (/数量|次数|个数|count|qty|quantity|days/iu.test(field)) return "integer";
  const numbers = values.filter((value) => typeof value === "number") as number[];
  return numbers.length > 0 && numbers.length === values.filter((value) => value != null).length && numbers.every(Number.isInteger)
    ? "integer"
    : "text";
}

function readableLabel(field: string): string {
  const value = field.replace(/^\[|\]$/gu, "").trim();
  if (/^[\u4e00-\u9fff]/u.test(value)) return value;
  const suffixes: Array<[RegExp, string]> = [
    [/_change_rate$/iu, "变化率"],
    [/_comparison$/iu, "（比较期）"],
    [/_change$/iu, "差额"],
  ];
  for (const [pattern, suffix] of suffixes) {
    if (pattern.test(value)) return `${businessBaseLabel(value.replace(pattern, ""))}${suffix}`;
  }
  return businessBaseLabel(value);
}

function businessBaseLabel(value: string): string {
  const approvedAliases: Record<string, string> = {
    order_amount: "销售订单金额",
    product_category: "产品类别",
    customer: "客户",
    company: "公司",
    period: "期间",
  };
  if (approvedAliases[value.toLowerCase()]) return approvedAliases[value.toLowerCase()];
  return value
    .replace(/[_-]+/gu, " ")
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

function stableKey(field: string, index: number): string {
  return field.trim().replace(/^\[|\]$/gu, "").replace(/[^A-Za-z0-9_\u4e00-\u9fff]+/gu, "_").replace(/^_+|_+$/gu, "").toLowerCase() || `column_${index + 1}`;
}

function uniqueKey(base: string, used: Set<string>): string {
  let key = base;
  let suffix = 2;
  while (used.has(key)) key = `${base}_${suffix++}`;
  used.add(key);
  return key;
}

function isGenericField(field: string): boolean {
  return /^(?:column|col|field|数据列)\s*_?\d+$/iu.test(field.trim());
}

function selectAliases(sql: string, count: number): string[] {
  if (!sql || count < 1) return [];
  const aliases = [...sql.matchAll(/\bAS\s+(?:\[([^\]]+)\]|([A-Za-z_][A-Za-z0-9_]*))/giu)]
    .map((match) => match[1] ?? match[2])
    .filter((value): value is string => Boolean(value));
  return aliases.slice(-count);
}
