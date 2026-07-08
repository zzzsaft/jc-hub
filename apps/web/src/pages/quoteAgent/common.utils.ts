import type {
  CandidateType,
  QuoteAgentDocument,
} from "./types";

export const asArray = <T,>(value: T[] | undefined | null): T[] => (Array.isArray(value) ? value : []);
export const docId = (document?: QuoteAgentDocument | null) => document?.documentId ?? document?.id ?? "";
export const docName = (document?: QuoteAgentDocument | null) => String(document?.fileName ?? document?.filePath ?? `文档 #${docId(document)}`);
export const responseDocs = (value: any): QuoteAgentDocument[] => value?.items ?? value?.documents ?? value?.data ?? [];
export const errorText = (error: unknown) =>
  (error as any)?.response?.data?.error ?? (error as any)?.response?.data?.message ?? (error as any)?.message ?? String(error);
export const draftKey = (type: CandidateType, id: string | number) => `${type}:${id}`;
export const json = (value: unknown) => JSON.stringify(value ?? null, null, 2);
export const textValue = (value: unknown, fallback = "-") =>
  value === undefined || value === null || value === "" ? fallback : String(value);

export const formatDateTime = (value?: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
};

export const getByDotPath = (source: unknown, path: string) => {
  if (!path) return source;
  return path.split(".").reduce<any>((current, segment) => {
    if (current == null) return undefined;
    const key = /^\d+$/.test(segment) ? Number(segment) : segment;
    return current[key];
  }, source as any);
};

export const setByDotPath = <T,>(source: T, path: string, value: unknown): T => {
  const segments = path.split(".");
  const root: any = Array.isArray(source) ? [...source] : { ...(source as any) };
  let cursor = root;
  segments.forEach((segment, index) => {
    const key: string | number = /^\d+$/.test(segment) ? Number(segment) : segment;
    if (index === segments.length - 1) {
      cursor[key] = value;
      return;
    }
    const nextSegment = segments[index + 1];
    const next = cursor[key];
    cursor[key] = Array.isArray(next)
      ? [...next]
      : next && typeof next === "object"
        ? { ...next }
        : /^\d+$/.test(nextSegment)
          ? []
          : {};
    cursor = cursor[key];
  });
  return root;
};

export const hasEvidence = (value: unknown) => {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
  return String(value).trim() !== "";
};
