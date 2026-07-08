import type { ConceptActionIntent, ConceptResolution, TargetHealthReport } from "../types";
import { cr } from "../classNames";
import {
  candidateNormalizedField,
  candidateNormalizedValue,
  candidateRawField,
  candidateRawValue,
  documentCountOf,
  healthRiskLabels,
  occurrenceCountOf,
  operationPreviewFor,
  primaryTarget,
  proposalId,
  quickApproveBlockReasons,
  unifiedScoreOf,
} from "../proposalReview";
import {
  asArray,
  evidenceOf,
  formatScore,
  recommendedActionLabel,
  relationTypeLabel,
  riskLabel,
  routeLabel,
  textValue,
} from "../utils";
import { ProposalDetails } from "./ProposalDetails";
import { Mini } from "./ProposalShared";

type ProposalCardProps = {
  resolution: ConceptResolution;
  selected: boolean;
  report?: TargetHealthReport;
  submitting: boolean;
  onToggleSelected: () => void;
  onOpenAction: (intent: ConceptActionIntent) => void;
};

export function ProposalCard({
  resolution,
  selected,
  report,
  submitting,
  onToggleSelected,
  onOpenAction,
}: ProposalCardProps) {
  const target = primaryTarget(resolution);
  const labels = healthRiskLabels(report);
  const quickBlockReasons = quickApproveBlockReasons(resolution, report);
  const quickOps = operationPreviewFor(resolution, "quickApprove");
  const approveOps = operationPreviewFor(resolution, "approve");
  const rejectOps = operationPreviewFor(resolution, "reject");
  const sendReviewOps = operationPreviewFor(resolution, "sendReview");
  const riskTone = cr("cr-proposal-card", (resolution.riskLevel === "high" || labels.length > 0) && "cr-proposal-card-risk");

  const open = (kind: ConceptActionIntent["kind"], operations: unknown[], label: string) => {
    onOpenAction({ kind, resolutions: [resolution], operations, label });
  };

  return (
    <article className={riskTone}>
      <div className={cr("cr-proposal-main")}>
        <div className={cr("cr-proposal-check")}>
          <input type="checkbox" checked={selected} disabled={submitting} onChange={onToggleSelected} aria-label={`选择 ${proposalId(resolution)}`} />
        </div>
        <div className={cr("cr-proposal-summary")}>
          <div className={cr("cr-proposal-titleline")}>
            <span className={cr("cr-badge")}>{textValue(resolution.candidateType)}</span>
            <strong>{candidateRawField(resolution) || candidateNormalizedField(resolution) || "未命名字段"}</strong>
            <span className={cr("cr-badge", `cr-risk-${textValue(resolution.riskLevel, "unknown")}`)}>{riskLabel(resolution.riskLevel)}</span>
            {labels.map((label) => <span key={label} className={cr("cr-badge cr-badge-warn")}>{label}</span>)}
          </div>
          <div className={cr("cr-proposal-grid")}>
            <Mini label="candidateId" value={resolution.candidateId} />
            <Mini label="rawValue" value={candidateRawValue(resolution)} />
            <Mini label="normalized" value={[candidateNormalizedField(resolution), candidateNormalizedValue(resolution)].filter(Boolean).join(" / ")} />
            <Mini label="sourceProductType" value={resolution.sourceProductType ?? (asArray(evidenceOf(resolution).sampleOccurrences)[0] as any)?.sourceProductType} />
            <Mini label="occ/docs" value={`${textValue(occurrenceCountOf(resolution))} / ${textValue(documentCountOf(resolution))}`} />
            <Mini label="route" value={routeLabel(resolution.route)} />
            <Mini label="relation/action" value={`${relationTypeLabel(resolution.relationType)} / ${recommendedActionLabel(resolution.recommendedAction)}`} />
            <Mini label="score" value={formatScore(unifiedScoreOf(resolution, target))} />
          </div>
        </div>
        <div className={cr("cr-proposal-target")}>
          <div className={cr("cr-muted")}>Suggested target</div>
          <strong>{textValue(target?.displayName ?? target?.canonicalValue ?? target?.termType)}</strong>
          <div className={cr("cr-muted cr-clamp")} title={textValue(target?.id)}>
            {textValue(target?.targetType)} #{textValue(target?.id)}
          </div>
          <div className={cr("cr-muted cr-clamp")}>{textValue(target?.termType)} · {formatScore(target?.score ?? target?.baseScore)}</div>
        </div>
        <ProposalActions
          approveOps={approveOps}
          quickBlockReasons={quickBlockReasons}
          quickOps={quickOps}
          rejectOps={rejectOps}
          sendReviewOps={sendReviewOps}
          submitting={submitting}
          open={open}
        />
      </div>

      <ProposalDetails resolution={resolution} report={report} target={target} />
    </article>
  );
}

function ProposalActions({
  approveOps,
  open,
  quickBlockReasons,
  quickOps,
  rejectOps,
  sendReviewOps,
  submitting,
}: {
  approveOps: unknown[];
  open: (kind: ConceptActionIntent["kind"], operations: unknown[], label: string) => void;
  quickBlockReasons: string[];
  quickOps: unknown[];
  rejectOps: unknown[];
  sendReviewOps: unknown[];
  submitting: boolean;
}) {
  return (
    <div className={cr("cr-proposal-actions")}>
      <button className="qa-btn qa-btn-primary qa-btn-sm" type="button" disabled={submitting || quickBlockReasons.length > 0} title={quickBlockReasons.join("；") || "一键通过"} onClick={() => open("quickApprove", quickOps, "一键通过")}>
        一键通过
      </button>
      <button className="qa-btn qa-btn-secondary qa-btn-sm" type="button" disabled={submitting || approveOps.length === 0} title={approveOps.length ? "进入确认后应用" : "没有后端可执行操作预览"} onClick={() => open("approve", approveOps, "确认应用")}>
        详细审核
      </button>
      <button className="qa-btn qa-btn-quiet qa-btn-sm" type="button" disabled={submitting || rejectOps.length === 0} title={rejectOps.length ? "拒绝 proposal" : "没有 reject 操作预览"} onClick={() => open("reject", rejectOps, "拒绝")}>
        拒绝
      </button>
      <button className="qa-btn qa-btn-quiet qa-btn-sm" type="button" disabled={submitting || sendReviewOps.length === 0} title={sendReviewOps.length ? "发送人工复核" : "没有 send to review 操作预览"} onClick={() => open("sendReview", sendReviewOps, "转人工")}>
        转人工
      </button>
      {quickBlockReasons.length > 0 && <div className={cr("cr-proposal-blocked")}>{quickBlockReasons.join("；")}</div>}
    </div>
  );
}
