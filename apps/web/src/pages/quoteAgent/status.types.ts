export type DocumentStatus =
  | "uploaded"
  | "parsed_blocks"
  | "extracted"
  | "normalized"
  | "dictionary_dirty"
  | "failed";

export type CandidateStatus = "pending" | "approved" | "rejected";
export type CandidateType = "term_type" | "value";
