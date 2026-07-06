export type WorkflowDocumentProgress = {
  documentId: number;
  fileName: string;
  status: "running" | "success" | "failed";
  contentLength?: number;
  chunkCount?: number;
  finishReason?: string | null;
  archiveUpdatedCount?: number;
  archiveVersionCount?: number;
  error?: string;
};

export type WorkflowJobResult = {
  total: number;
  processed: number;
  successCount: number;
  failedCount: number;
  currentDocumentIds: number[];
  documentProgress: WorkflowDocumentProgress[];
  errors: Array<{ documentId: number; fileName: string; error: string }>;
};

export type ParseBlocksInput = {
  filePath: string;
  fileName?: string;
  source?: string;
  parserVersion?: string;
  forceReparse?: boolean;
  blocksJson?: unknown;
};

export type ParseBlocksBatchError = {
  fileName: string;
  filePath: string;
  stage: string;
  errorCode: string;
  errorMessage: string;
};

export type ParseBlocksBatchSuccess = {
  fileName: string;
  filePath: string;
  document: any;
  blocks: any;
  reusedBlocks: boolean;
};

export type ParseBlocksBatchResult = {
  total: number;
  successCount: number;
  failedCount: number;
  successes: ParseBlocksBatchSuccess[];
  errors: ParseBlocksBatchError[];
};
