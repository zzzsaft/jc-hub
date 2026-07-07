import type { CandidateStatus, DictionaryOptions, DocumentStatus } from "./types";

export const documentStatuses: Array<{ value: DocumentStatus | ""; label: string }> = [
  { value: "", label: "全部状态" },
  { value: "uploaded", label: "已上传" },
  { value: "parsed_blocks", label: "已分块" },
  { value: "extracted", label: "已提取" },
  { value: "normalized", label: "已归一化" },
  { value: "dictionary_dirty", label: "待字典审核" },
  { value: "failed", label: "失败" },
];

export const candidateStatuses: Array<{ value: CandidateStatus; label: string }> = [
  { value: "pending", label: "待审核" },
  { value: "approved", label: "已通过" },
  { value: "rejected", label: "已拒绝" },
];

export const emptyOptions: DictionaryOptions = { termTypes: [], values: [], productTypes: [] };
export const pageSize = 1;
