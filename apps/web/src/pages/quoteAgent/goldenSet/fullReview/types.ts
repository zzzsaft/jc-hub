export type AdmissionDecision = "auto_archive" | "quarantine" | "reject";
export type EvidenceSufficiency = "sufficient" | "insufficient_evidence" | "legitimate_ambiguity" | "abstain";
export type ErpDecision = "unique_match" | "legitimate_ambiguity" | "insufficient_evidence" | "abstain";
export type ItemRole = "peer_product" | "component" | "accessory" | "spare_part" | "sales_kit" | "manufacturing_intermediate" | "unknown";

export type PackageItem = {
  gold_item_id: string;
  matched_prediction_item_id: string | null;
  item_name: string;
  product_family: string | null;
  product_subtype: string | null;
  item_role: ItemRole;
  model: string | null;
  peer_group_id: string | null;
  related_to_gold_item_id: string | null;
  evidence_refs: string[];
};

export type PackageAnnotation = { evidence_sufficiency: EvidenceSufficiency; items: PackageItem[]; notes: string | null };
export type ConfigurationField = { field_key: string; value: string | null; unit: string | null; option: string | null; item_id: string | null; evidence_refs: string[] };
export type ErpIdentity = { company: string; part_num: string; erp_product_name: string; evidence_refs: string[] };
export type ErpMapping = { gold_item_id: string; decision: ErpDecision; acceptable_identities: ErpIdentity[]; notes: string | null };

export type FullReviewAnnotation = {
  admission: { decision: AdmissionDecision; reason_codes: string[]; notes: string | null };
  package: PackageAnnotation;
  configuration_fields: ConfigurationField[];
  erp: ErpMapping[];
};

export type FrozenEvidence = { evidence_id: string; content: string };
export type FullReviewTask = {
  schema_version: string;
  document_id: string;
  cohort: "calibration" | "acceptance";
  evidence_hash: string;
  evidence: FrozenEvidence[];
  annotation: FullReviewAnnotation | null;
  revision: number;
};

export type FullReviewTaskDto = Omit<FullReviewTask, "annotation" | "revision"> & {
  draft: FullReviewAnnotation | null;
  submission: FullReviewAnnotation | null;
};
export type FullReviewTasksResponse = { revision: number; items: FullReviewTaskDto[] };

export type EvidenceCard = { label: string; value: string; originalKey: string };
export type EvidenceChoice = { label: string; selected: boolean };
export type EvidenceDisplayRow = {
  label: string;
  source: string | null;
  value: string | null;
  detail: string | null;
  choices: EvidenceChoice[];
};
export type EvidenceSection = {
  evidenceId: string;
  title: string;
  leftHeading: string;
  rightHeading: string;
  rows: EvidenceDisplayRow[];
  fallbackMessage: string | null;
};
export type SaveState = "idle" | "saving" | "saved" | "failed";
export type RevisionResponse = { revision: number };
