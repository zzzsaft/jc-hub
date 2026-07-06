import type { Response } from "express";

export function sendError(response: Response, error: unknown) {
  response.status(400).json({
    error: error instanceof Error ? error.message : String(error),
  });
}

export function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(name + " is required");
  }
  return value.trim();
}

export function optionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

export function optionalNumber(value: unknown): number | undefined {
  const stringValue = optionalString(value);
  if (!stringValue) return undefined;
  const numberValue = Number(stringValue);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

export function requireCandidateAction(value: unknown): any {
  const action = String(value ?? "").trim();
  const allowed = new Set([
    "approve",
    "reject",
    "merge",
    "create-term-type",
    "create_term_type",
    "approve-as-alias",
    "approve_as_alias",
    "approve_term_type_as_alias",
    "approve_value_as_alias",
    "create-value",
    "create_value",
    "move-to-term-type",
    "move_to_other_term_type",
    "move_value_to_other_term_type",
    "mark-as-doc-info",
    "mark_as_doc_info",
    "mark_term_type_as_doc_info",
    "update-term-type-kind",
    "update_term_type_kind",
    "update_term_type_value_kind",
    "split-suggest",
    "split_suggest",
    "split",
    "split_term_type",
    "split_value",
    "needs-human-review",
    "needs_human_review",
  ]);
  if (allowed.has(action)) return action;
  throw new Error("unsupported candidate action");
}

export function requireModelTermType(value: unknown): "filter_model" | "metering_pump_model" {
  if (value === "filter_model" || value === "metering_pump_model") return value;
  throw new Error("termType must be filter_model or metering_pump_model");
}
