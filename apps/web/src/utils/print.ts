import type { QuoteItem } from "@/types/types";
import fields from "../../scripts/form_fields.json" assert { type: "json" };

interface PrintField {
  name: string;
  label: string;
  type: string;
  value: string;
}

function formatValue(value: any, type: string): string {
  if (value === null || value === undefined) return "";

  if (type.includes("IntervalInput")) {
    const val = value?.value ?? "";
    const unit = value?.unit ?? "";
    return `${val}${unit}`.trim();
  }

  if (type.includes("LevelInput")) {
    const level = value?.level ?? "";
    const val = formatValue(value?.value, "IntervalInput");
    return `${level}:${val}`;
  }

  if (Array.isArray(value)) {
    return value.join("; \n");
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

const fieldMap = fields as Record<string, Array<{ name: string; label: string; type: string }>>;

export function quoteItemToPrintData(quoteItem: QuoteItem): PrintField[] {
  const config = (quoteItem as any).config || {};
  const formType = quoteItem.formType || "OtherForm";
  const list = fieldMap[formType] || [];
  return list.map((f) => ({
    name: f.name,
    label: f.label,
    type: f.type,
    value: formatValue(config[f.name], f.type),
  }));
}
