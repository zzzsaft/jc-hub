import type {
  Candidate,
  CandidateCluster,
  DictionaryOptions,
  QuoteAgentField,
  ReviewDraft,
  ReviewOperation,
} from "../types";
import { FieldReviewPanel } from "./FieldReviewPanel";

interface Props {
  cluster: CandidateCluster | null;
  options: DictionaryOptions;
  onClose: () => void;
  onSave: (cluster: CandidateCluster, operation: ReviewOperation) => void;
  onSubmit: (cluster: CandidateCluster, operation: ReviewOperation) => Promise<void>;
}

const first = (value?: unknown[]) => value?.[0] ? String(value[0]) : "";

function candidateFromCluster(cluster: CandidateCluster): Candidate {
  return {
    id: String(cluster.candidateIds?.[0] ?? cluster.clusterId ?? cluster.id ?? ""),
    candidateType: cluster.candidateType,
    rawFieldName: cluster.normalizedFieldName || first(cluster.rawFieldNameSamples),
    rawValue: cluster.normalizedRawValue || first(cluster.rawValueSamples),
    termType: cluster.termType || cluster.normalizedFieldName,
    reason: cluster.reason || "",
    sourceProductType: cluster.sourceProductType,
  };
}

function fieldFromCluster(cluster: CandidateCluster): QuoteAgentField {
  return {
    field_name: cluster.normalizedFieldName || first(cluster.rawFieldNameSamples),
    raw_value: cluster.normalizedRawValue || first(cluster.rawValueSamples),
    dictionary: {
      term_type: cluster.termType || cluster.normalizedFieldName,
      normalized_field_name: cluster.termType || cluster.normalizedFieldName,
    },
  };
}

export function CandidateClusterManualReviewPanel({ cluster, options, onClose, onSave, onSubmit }: Props) {
  if (!cluster?.candidateType) return null;

  const candidate = candidateFromCluster(cluster);
  const field = fieldFromCluster(cluster);
  const draft: ReviewDraft | undefined = cluster.batchOperationsPreview?.[0]
    ? {
        ...cluster.batchOperationsPreview[0],
        label: String(cluster.batchOperationsPreview[0].action),
        updatedAt: Date.now(),
      }
    : undefined;

  return (
    <div className="fixed inset-0 z-[1050] bg-slate-950/20">
      <div className="absolute left-3 right-3 top-16 text-xs text-white md:left-auto md:right-6 md:w-[520px]">
        手动审批会把同一操作应用到该候选簇的全部 {cluster.candidateIds?.length ?? 0} 个 candidate。
      </div>
      <FieldReviewPanel
        field={field}
        candidate={candidate}
        candidateType={cluster.candidateType}
        options={options}
        draft={draft}
        onSaveDraft={(nextDraft) => onSave(cluster, nextDraft)}
        onSubmit={(operation) => onSubmit(cluster, operation)}
        onClose={onClose}
      />
    </div>
  );
}
