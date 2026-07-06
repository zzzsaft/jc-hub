import { productConfigAgentRepository } from "../db.service.js";
import { productConfigAgentService } from "../service.js";
import { productConfigAgentBlockParsingService } from "./blockParsing.service.js";
import type { ParseBlocksInput } from "./types.js";

export async function runProductConfigExtractionWorkflow(input: ParseBlocksInput & {
  llmModel?: string;
  forceReextract?: boolean;
}) {
  const parsed = await productConfigAgentBlockParsingService.parseAndSaveBlocks(input);
  const extracted = await productConfigAgentService.extractDocument({
    documentId: parsed.document.id,
    llmModel: input.llmModel,
    force: input.forceReextract,
  });
  const candidates = await productConfigAgentRepository.refreshDictionaryCandidates({
    documentId: parsed.document.id,
    source: "extraction_workflow",
  });
  return {
    document: parsed.document,
    blocks: parsed.blocks,
    extraction: extracted.extraction,
    reusedBlocks: parsed.reusedBlocks,
    reusedExtraction: extracted.reusedExtraction,
    candidates,
  };
}
