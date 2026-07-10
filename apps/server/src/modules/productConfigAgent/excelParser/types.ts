export class ExcelParserError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ExcelParserError";
  }
}

export type ParsedOption = {
  selected: boolean;
  label: string;
  value: string;
  normalized: string;
};

export type CellBlock = {
  block_id: string;
  id: string;
  type: "cell";
  text: string;
  raw_text: string;
  comment_text?: string;
  options: ParsedOption[];
  source: {
    sheet_name: string;
    kind: "cell";
    cell: string;
    row: number;
    col: number;
    sheet_range: string | null;
    merge_range: string | null;
    hidden?: boolean;
  };
};

export type RowBlock = {
  block_id: string;
  id: string;
  type: "row";
  text: string;
  content: {
    text: string;
    cells: Array<{
      source: string;
      text: string;
      raw_text: string;
      options: ParsedOption[];
    }>;
  };
  source: {
    sheet_name: string;
    kind: "row";
    range: string;
    cells: string[];
    hidden?: boolean;
  };
};

export type TextboxBlock = {
  block_id: string;
  id: string;
  type: "paragraph";
  text: string;
  raw_text: string;
  options: ParsedOption[];
  source: {
    sheet_name: string | null;
    kind: "textbox";
    drawing: string;
    mapping_status: "unmapped";
    anchor: {
      from: string | null;
      to: string | null;
    };
  };
};

export type ExcelBlock = CellBlock | RowBlock | TextboxBlock;

export type BuildLlmTextOptions = {
  mode?: "row" | "cell";
  includeInstruction?: boolean;
  includeFileMeta?: boolean;
  includeSheetName?: boolean;
  includeEmptyCells?: boolean;
  includeMergeContext?: boolean;
  skipHeaderLikeRows?: boolean;
};

export type ExcelParserOptions = {
  parseTextboxes?: boolean;
  keepTempFile?: boolean;
  includeRowBlocks?: boolean;
  xlsMode?: "direct-first" | "direct" | "convert";
  buildLlmText?: boolean;
  llmTextOptions?: BuildLlmTextOptions;
};

export type ExcelParseResult =
  | {
      success: true;
      data: {
        file_name: string;
        source_type: "local" | "url";
        blocks: ExcelBlock[];
        llm_text?: string;
      };
    }
  | {
      success: false;
      error: {
        code: string;
        message: string;
      };
    };
