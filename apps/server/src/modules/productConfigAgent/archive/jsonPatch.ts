export type RejectedPatchPath = {
  path: string;
  reason: string;
};

export type ArchivePatchChange = {
  path: string;
  value: unknown;
};

export class ArchivePatchValidationError extends Error {
  constructor(public readonly rejectedPaths: RejectedPatchPath[]) {
    super(
      `Patch contains non-editable paths: ${rejectedPaths
        .map((item) => `${item.path || "(empty)"} (${item.reason})`)
        .join("; ")}`,
    );
    this.name = "ArchivePatchValidationError";
  }
}

const DANGEROUS_PATH_SEGMENTS = new Set(["__proto__", "constructor", "prototype"]);

const ALLOWED_DOC_INFO_KEYS = new Set([
  "product_number",
  "contract_number",
  "order_number",
  "customer_id",
  "country",
  "order_date",
  "delivery_date",
  "completion_date",
  "shipment_date",
  "usage_market",
  "business_owner",
  "contract_creator",
]);

const ALLOWED_DOC_INFO_LEAF_KEYS = new Set([
  "value",
  "rawValue",
  "rawKey",
  "canonicalKey",
  "confidence",
  "evidence",
  "source",
  "text",
]);

const ALLOWED_ITEM_KEYS = new Set(["itemName", "itemQuantity", "fields", "warnings"]);

export function pathSegments(path: string): string[] {
  const separator = path.includes("/") ? "/" : ".";
  return path
    .split(separator)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

export function readPath(root: any, path: string): unknown {
  let cursor = root;
  for (const segment of pathSegments(path)) {
    if (cursor === null || cursor === undefined) return undefined;
    const key = Array.isArray(cursor) ? Number(segment) : segment;
    cursor = cursor[key as any];
  }
  return cursor;
}

export function writePath(root: any, path: string, value: unknown) {
  const segments = pathSegments(path);
  if (segments.length === 0) throw new Error("change path is required");
  if (hasDangerousSegment(segments)) throw new Error("dangerous path segment is not allowed");
  let cursor = root;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const key = Array.isArray(cursor) ? Number(segments[index]) : segments[index];
    if (cursor[key as any] === undefined || cursor[key as any] === null) {
      const nextSegment = segments[index + 1];
      cursor[key as any] = /^\d+$/.test(nextSegment) ? [] : {};
    }
    cursor = cursor[key as any];
  }
  const finalSegment = segments[segments.length - 1];
  const finalKey = Array.isArray(cursor) ? Number(finalSegment) : finalSegment;
  cursor[finalKey as any] = value;
}

export function validateArchivePatchChanges(changes: Array<{ path?: unknown }>): RejectedPatchPath[] {
  return changes
    .map((change) => {
      const path = String(change?.path ?? "").trim();
      const result = isAllowedArchivePatchPath(path);
      return result === true ? null : { path, reason: result };
    })
    .filter((item): item is RejectedPatchPath => item !== null);
}

export function assertAllowedArchivePatchChanges(changes: Array<{ path?: unknown }>) {
  const rejected = validateArchivePatchChanges(changes);
  if (rejected.length > 0) throw new ArchivePatchValidationError(rejected);
}

export function validateArchivePatchChangesAgainstSnapshot(snapshot: any, changes: Array<{ path?: unknown }>): RejectedPatchPath[] {
  return changes
    .map((change) => {
      const path = String(change?.path ?? "").trim();
      const segments = pathSegments(path);
      if (segments[0] !== "items") return null;
      const itemIndex = Number(segments[1]);
      const item = Array.isArray(snapshot?.items) ? snapshot.items[itemIndex] : undefined;
      if (!item) return { path, reason: "archive item index does not exist" };
      if (!item.id) return { path, reason: "archive item id is required" };
      return null;
    })
    .filter((item): item is RejectedPatchPath => item !== null);
}

export function assertAllowedArchivePatchChangesAgainstSnapshot(snapshot: any, changes: Array<{ path?: unknown }>) {
  const rejected = validateArchivePatchChangesAgainstSnapshot(snapshot, changes);
  if (rejected.length > 0) throw new ArchivePatchValidationError(rejected);
}

export function collapseArchivePatchArrayChanges(snapshot: any, changes: ArchivePatchChange[]): ArchivePatchChange[] {
  const collapsed: ArchivePatchChange[] = [];
  const arraysByPath = new Map<string, { outputIndex: number; value: unknown }>();
  const rejected: RejectedPatchPath[] = [];

  for (const change of changes) {
    const path = String(change?.path ?? "").trim();
    const segments = pathSegments(path);
    const allowed = isAllowedArchivePatchPath(path);
    if (allowed === true) {
      if (segments.length === 3 && isArrayReplacementPath(segments)) {
        const value = cloneJson(change.value);
        const existing = arraysByPath.get(path);
        if (existing) {
          existing.value = value;
          collapsed[existing.outputIndex] = { path, value };
        } else {
          arraysByPath.set(path, { outputIndex: collapsed.length, value });
          collapsed.push({ path, value });
        }
        continue;
      }
      collapsed.push({ path, value: change.value });
      continue;
    }

    if (
      allowed === "fields and warnings must be replaced as whole arrays" &&
      isArrayElementPatchPath(segments) &&
      segments.length > 3 &&
      !hasDangerousSegment(segments)
    ) {
      const arrayPath = segments.slice(0, 3).join(".");
      let arrayChange = arraysByPath.get(arrayPath);
      if (!arrayChange) {
        const currentValue = readPath(snapshot, arrayPath);
        arrayChange = { outputIndex: collapsed.length, value: Array.isArray(currentValue) ? cloneJson(currentValue) : [] };
        arraysByPath.set(arrayPath, arrayChange);
        collapsed.push({ path: arrayPath, value: arrayChange.value });
      }
      writePath(arrayChange.value, segments.slice(3).join("."), change.value);
      collapsed[arrayChange.outputIndex] = { path: arrayPath, value: arrayChange.value };
      continue;
    }

    rejected.push({ path, reason: allowed });
  }

  if (rejected.length > 0) throw new ArchivePatchValidationError(rejected);
  return collapsed;
}

function isAllowedArchivePatchPath(path: string): true | string {
  const segments = pathSegments(path);
  if (segments.length === 0) return "change path is required";
  if (hasDangerousSegment(segments)) return "dangerous path segment is not allowed";
  if (segments[0] === "docInfo") {
    const docInfoKey = segments[1];
    if (!docInfoKey || !ALLOWED_DOC_INFO_KEYS.has(docInfoKey)) return "docInfo key is not editable";
    if (segments.length === 2) return true;
    if (segments.length === 3 && ALLOWED_DOC_INFO_LEAF_KEYS.has(segments[2])) return true;
    return "docInfo path is not editable";
  }
  if (segments[0] === "items") {
    if (!isNumericSegment(segments[1] ?? "")) return "items path must include a numeric index";
    const itemKey = segments[2];
    if (!itemKey || !ALLOWED_ITEM_KEYS.has(itemKey)) return "archive item field is not editable";
    if (itemKey === "fields" || itemKey === "warnings") {
      return segments.length === 3 ? true : "fields and warnings must be replaced as whole arrays";
    }
    return segments.length === 3 ? true : "archive item path is not editable";
  }
  return "path is not editable";
}

function isArrayReplacementPath(segments: string[]): boolean {
  return segments[0] === "items" && isNumericSegment(segments[1] ?? "") && (segments[2] === "fields" || segments[2] === "warnings");
}

function isArrayElementPatchPath(segments: string[]): boolean {
  return isArrayReplacementPath(segments) && isNumericSegment(segments[3] ?? "");
}

function isNumericSegment(value: string): boolean {
  return /^\d+$/.test(value);
}

function hasDangerousSegment(segments: string[]): boolean {
  return segments.some((segment) => DANGEROUS_PATH_SEGMENTS.has(segment));
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? null));
}
