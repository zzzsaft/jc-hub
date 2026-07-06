import AdmZip from "adm-zip";
import XLSX from "xlsx";
import type { TextboxBlock } from "./types.js";
import { parseOptionsFromText } from "./options.js";
import { sanitizeExcelText } from "./text.js";

export function parseTextboxes(filePath: string): TextboxBlock[] {
  const blocks: TextboxBlock[] = [];
  try {
    const zip = new AdmZip(filePath);
    const drawingEntries = zip
      .getEntries()
      .filter((entry: { isDirectory: boolean; entryName: string }) => !entry.isDirectory && /^xl\/drawings\/drawing\d+\.xml$/i.test(entry.entryName));
    let textboxIndex = 1;
    for (const entry of drawingEntries) {
      const xml = entry.getData().toString("utf8");
      const shapeXmls = collectShapeXmls(xml);
      for (const shapeXml of shapeXmls) {
        const rawText = sanitizeExcelText(
          [...shapeXml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>|<t[^>]*>([\s\S]*?)<\/t>/g)]
            .map((match) => decodeXml(match[1] ?? match[2] ?? ""))
            .join(""),
        ).trim();
        if (!rawText) continue;
        const optionResult = parseOptionsFromText(rawText);
        const blockId = `textbox_${textboxIndex++}`;
        blocks.push({
          block_id: blockId,
          id: blockId,
          type: "paragraph",
          text: optionResult.normalizedText,
          raw_text: rawText,
          options: optionResult.options,
          source: {
            sheet_name: "UNKNOWN_NEED_REL_MAPPING",
            kind: "textbox",
            drawing: entry.entryName,
            anchor: parseAnchor(shapeXml),
          },
        });
      }
    }
  } catch (error) {
    console.warn("Parse xlsx textboxes failed:", error instanceof Error ? error.message : String(error));
  }
  return blocks;
}

function collectShapeXmls(xml: string) {
  const matches = [...xml.matchAll(/<xdr:sp\b[\s\S]*?<\/xdr:sp>|<sp\b[\s\S]*?<\/sp>/g)].map((match) => match[0]);
  return matches.filter((item) => /(?:xdr:txBody|txBody|<a:t|<t)/.test(item));
}

function parseAnchor(xml: string) {
  return {
    from: anchorPointToCell(xml.match(/<(?:xdr:)?from\b[\s\S]*?<\/(?:xdr:)?from>/)?.[0] ?? ""),
    to: anchorPointToCell(xml.match(/<(?:xdr:)?to\b[\s\S]*?<\/(?:xdr:)?to>/)?.[0] ?? ""),
  };
}

function anchorPointToCell(xml: string) {
  const col = Number(xml.match(/<(?:xdr:)?col>(\d+)<\/(?:xdr:)?col>/)?.[1]);
  const row = Number(xml.match(/<(?:xdr:)?row>(\d+)<\/(?:xdr:)?row>/)?.[1]);
  if (!Number.isFinite(col) || !Number.isFinite(row)) return null;
  return XLSX.utils.encode_cell({ r: row, c: col });
}

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
