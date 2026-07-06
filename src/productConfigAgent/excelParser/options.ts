import type { ParsedOption } from "./types.js";
import { makeLlmFriendlyText, normalizeOptionMarksInline } from "./text.js";

export function parseOptionsFromText(text: string): { hasOptions: boolean; options: ParsedOption[]; normalizedText: string } {
  const normalizedInline = normalizeOptionMarksInline(text);
  const options: ParsedOption[] = [];
  const matches = Array.from(normalizedInline.matchAll(/\[(SEL| )\]/g));
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const nextMatch = matches[index + 1];
    const token = match[0];
    const segmentStart = (match.index ?? 0) + token.length;
    const segmentEnd = nextMatch?.index ?? normalizedInline.length;
    const label = extractOptionLabel(normalizedInline.slice(segmentStart, segmentEnd));
    if (!label) continue;
    const selected = token === "[SEL]";
    options.push({ selected, label, value: label, normalized: `${selected ? "[SEL]" : "[ ]"} ${label}` });
  }
  return { hasOptions: options.length > 0, options, normalizedText: makeLlmFriendlyText(text) };
}

function extractOptionLabel(segment: string) {
  const withoutPrefix = segment.replace(/^[\s:：,，;；、\-]+/, "");
  const lineBreakStop = withoutPrefix.search(/\r?\n/);
  const lineText = lineBreakStop >= 0 ? withoutPrefix.slice(0, lineBreakStop) : withoutPrefix;
  return trimOptionLabel(removeTrailingNextOptionContext(lineText));
}

function trimOptionLabel(label: string) {
  return label.replace(/^[\s:：,，;；、\-]+/, "").replace(/[\s,，;；、]+$/, "").trim();
}

function removeTrailingNextOptionContext(label: string) {
  const whitespaceRunRegExp = /[ \t\u3000]{2,}/g;
  let match: RegExpExecArray | null;
  while ((match = whitespaceRunRegExp.exec(label))) {
    if (isInsideBrackets(label, match.index)) continue;
    const head = label.slice(0, match.index);
    const tail = label.slice(match.index + match[0].length);
    if (trimOptionLabel(head) && looksLikeNextOptionContext(tail)) return head;
  }
  return label;
}

function looksLikeNextOptionContext(text: string) {
  const compact = trimOptionLabel(text).replace(/\s+/g, "");
  return Boolean(compact && compact.length <= 16 && !/[：:；;，,、]/.test(compact) && /^[\u4e00-\u9fa5A-Za-z0-9（）()]+$/.test(compact));
}

function isInsideBrackets(text: string, index: number) {
  const before = text.slice(0, index);
  const lastOpen = Math.max(before.lastIndexOf("（"), before.lastIndexOf("("));
  const lastClose = Math.max(before.lastIndexOf("）"), before.lastIndexOf(")"));
  return lastOpen > lastClose;
}
