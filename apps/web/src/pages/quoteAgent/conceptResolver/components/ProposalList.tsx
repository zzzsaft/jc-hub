import type { ReactNode } from "react";
import type { ConceptActionIntent, ConceptResolution, TargetHealthReport } from "../types";
import {
  affectedRecordSamples,
  candidateNormalizedField,
  candidateNormalizedValue,
  candidateRawField,
  candidateRawValue,
  documentCountOf,
  hardConstraintsOf,
  healthRiskLabels,
  occurrenceCountOf,
  operationPreviewFor,
  policyEvaluationOf,
  primaryTarget,
  proposalId,
  quickApproveBlockReasons,
  reportForTarget,
  scoringVectorOf,
  trustTierOf,
  unifiedScoreOf,
} from "../proposalReview";
import {
  asArray,
  evidenceOf,
  formatDateTime,
  formatScore,
  json,
  recommendedActionLabel,
  relationTypeLabel,
  riskLabel,
  routeLabel,
  textValue,
} from "../utils";

type Props = {
  resolutions: ConceptResolution[];
  selectedIds: string[];
  healthReports: Record<string, TargetHealthReport>;
  loading: boolean;
  healthLoading: boolean;
  submitting: boolean;
  onToggleSelected: (id: string) => void;
  onTogglePageSelected: () => void;
  onOpenAction: (intent: ConceptActionIntent) => void;
};

export function ProposalList({
  resolutions,
  selectedIds,
  healthReports,
  loading,
  healthLoading,
  submitting,
  onToggleSelected,
  onTogglePageSelected,
  onOpenAction,
}: Props) {
  const allSelected = resolutions.length > 0 && resolutions.every((resolution) => selectedIds.includes(proposalId(resolution)));

  if (loading) {
    return (
      <div className="cr-proposal-list">
        {Array.from({ length: 6 }).map((_, index) => <div key={index} className="cr-skeleton-row" />)}
      </div>
    );
  }

  if (!resolutions.length) {
    return (
      <div className="cr-empty">
        <div>暂无 resolution proposals</div>
        <div className="cr-empty-sub">调整筛选条件或重新运行 dry resolver 后再查看。</div>
      </div>
    );
  }

  return (
    <div className="cr-proposal-list">
      <div className="cr-proposal-selectbar">
        <label className="inline-flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={allSelected} disabled={submitting} onChange={onTogglePageSelected} />
          选择当前页
        </label>
        {healthLoading && <span className="cr-muted">正在加载 target health report...</span>}
      </div>
      {resolutions.map((resolution) => (
        <ProposalCard
          key={proposalId(resolution)}
          resolution={resolution}
          selected={selectedIds.includes(proposalId(resolution))}
          report={reportForTarget(primaryTarget(resolution), healthReports)}
          submitting={submitting}
          onToggleSelected={() => onToggleSelected(proposalId(resolution))}
          onOpenAction={onOpenAction}
        />
      ))}
    </div>
  );
}

function ProposalCard({
  resolution,
  selected,
  report,
  submitting,
  onToggleSelected,
  onOpenAction,
}: {
  resolution: ConceptResolution;
  selected: boolean;
  report?: TargetHealthReport;
  submitting: boolean;
  onToggleSelected: () => void;
  onOpenAction: (intent: ConceptActionIntent) => void;
}) {
  const target = primaryTarget(resolution);
  const policy = policyEvaluationOf(resolution);
  const targetPolicy = policyEvaluationOf(target);
  const quickBlockReasons = quickApproveBlockReasons(resolution, report);
  const quickOps = operationPreviewFor(resolution, "quickApprove");
  const approveOps = operationPreviewFor(resolution, "approve");
  const rejectOps = operationPreviewFor(resolution, "reject");
  const sendReviewOps = operationPreviewFor(resolution, "sendReview");
  const labels = healthRiskLabels(report);
  const riskTone = resolution.riskLevel === "high" || labels.length ? "cr-proposal-card cr-proposal-card-risk" : "cr-proposal-card";

  const open = (kind: ConceptActionIntent["kind"], operations: unknown[], label: string) => {
    onOpenAction({ kind, resolutions: [resolution], operations, label });
  };

  return (
    <article className={riskTone}>
      <div className="cr-proposal-main">
        <div className="cr-proposal-check">
          <input type="checkbox" checked={selected} disabled={submitting} onChange={onToggleSelected} aria-label={`选择 ${proposalId(resolution)}`} />
        </div>
        <div className="cr-proposal-summary">
          <div className="cr-proposal-titleline">
            <span className="cr-badge">{textValue(resolution.candidateType)}</span>
            <strong>{candidateRawField(resolution) || candidateNormalizedField(resolution) || "未命名字段"}</strong>
            <span className={`cr-badge cr-risk-${textValue(resolution.riskLevel, "unknown")}`}>{riskLabel(resolution.riskLevel)}</span>
            {labels.map((label) => <span key={label} className="cr-badge cr-badge-warn">{label}</span>)}
          </div>
          <div className="cr-proposal-grid">
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
        <div className="cr-proposal-target">
          <div className="cr-muted">Suggested target</div>
          <strong>{textValue(target?.displayName ?? target?.canonicalValue ?? target?.termType)}</strong>
          <div className="cr-muted cr-clamp" title={textValue(target?.id)}>
            {textValue(target?.targetType)} #{textValue(target?.id)}
          </div>
          <div className="cr-muted cr-clamp">{textValue(target?.termType)} · {formatScore(target?.score ?? target?.baseScore)}</div>
        </div>
        <div className="cr-proposal-actions">
          <button
            className="qa-btn qa-btn-primary qa-btn-sm"
            type="button"
            disabled={submitting || quickBlockReasons.length > 0}
            title={quickBlockReasons.join("；") || "一键通过"}
            onClick={() => open("quickApprove", quickOps, "一键通过")}
          >
            一键通过
          </button>
          <button
            className="qa-btn qa-btn-secondary qa-btn-sm"
            type="button"
            disabled={submitting || approveOps.length === 0}
            title={approveOps.length ? "进入确认后应用" : "没有后端可执行操作预览"}
            onClick={() => open("approve", approveOps, "确认应用")}
          >
            详细审核
          </button>
          <button
            className="qa-btn qa-btn-quiet qa-btn-sm"
            type="button"
            disabled={submitting || rejectOps.length === 0}
            title={rejectOps.length ? "拒绝 proposal" : "没有 reject 操作预览"}
            onClick={() => open("reject", rejectOps, "拒绝")}
          >
            拒绝
          </button>
          <button
            className="qa-btn qa-btn-quiet qa-btn-sm"
            type="button"
            disabled={submitting || sendReviewOps.length === 0}
            title={sendReviewOps.length ? "发送人工复核" : "没有 send to review 操作预览"}
            onClick={() => open("sendReview", sendReviewOps, "转人工")}
          >
            转人工
          </button>
          {quickBlockReasons.length > 0 && <div className="cr-proposal-blocked">{quickBlockReasons.join("；")}</div>}
        </div>
      </div>

      <details className="cr-proposal-details">
        <summary>展开审核证据、健康信号和应用示例</summary>
        <div className="cr-proposal-detail-grid">
          <Panel title="Candidate 信息">
            <Info label="candidateType" value={resolution.candidateType} />
            <Info label="candidateId" value={resolution.candidateId} />
            <Info label="rawFieldName" value={candidateRawField(resolution)} />
            <Info label="rawValue" value={candidateRawValue(resolution)} />
            <Info label="normalizedFieldName" value={candidateNormalizedField(resolution)} />
            <Info label="normalizedRawValue" value={candidateNormalizedValue(resolution)} />
            <Info label="sourceProductType" value={resolution.sourceProductType} />
            <Info label="route / relation / action" value={`${textValue(resolution.route)} / ${textValue(resolution.relationType)} / ${textValue(resolution.recommendedAction)}`} />
            <Info label="reason" value={resolution.reason} />
            <JsonDetails title="issues" value={resolution.issues ?? resolution.issuesJsonb ?? []} />
          </Panel>

          <Panel title="Suggested target">
            <Info label="targetType" value={target?.targetType} />
            <Info label="target id" value={target?.id} />
            <Info label="termType" value={target?.termType} />
            <Info label="canonicalValue" value={target?.canonicalValue} />
            <Info label="displayName" value={target?.displayName} />
            <Info label="relationType" value={target?.relationType} />
            <Info label="base score" value={formatScore(target?.baseScore ?? target?.score)} />
            <Info label="contextAwareScore" value={formatScore(target?.contextAwareScore ?? resolution.contextAwareScore)} />
            <Info label="unifiedScore" value={formatScore(unifiedScoreOf(resolution, target))} />
            <ScoringVector policy={policy} targetPolicy={targetPolicy} />
          </Panel>

          <HealthPanel report={report} />
          <AliasPanel report={report} />
          <StatisticsPanel report={report} />
          <AffectedPanel resolution={resolution} report={report} />
          <BeforeAfterPanel resolution={resolution} target={target} />
          <Panel title="Hard constraints">
            <ConstraintList constraints={hardConstraintsOf(policy)} />
          </Panel>
        </div>
      </details>
    </article>
  );
}

function HealthPanel({ report }: { report?: TargetHealthReport }) {
  const evidence = report?.evidenceJson ?? report?.evidence_json ?? {};
  if (!report) {
    return <Panel title="Target health report"><div className="cr-muted">暂无 health report</div></Panel>;
  }
  return (
    <Panel title="Target health report">
      <Info label="riskScore" value={report.riskScore} />
      <Info label="riskLabels" value={healthRiskLabels(report).join("、")} />
      <Info label="recommendedAction" value={report.recommendedAction} />
      <Info label="affectedRecordsCount" value={report.affectedRecordsCount} />
      <Info label="lastAuditedAt" value={formatDateTime(report.lastAuditedAt)} />
      <JsonDetails title="trustSignals" value={report.trustSignals ?? {}} />
      <JsonDetails title="dimensions" value={evidence.dimensions ?? {}} />
    </Panel>
  );
}

function AliasPanel({ report }: { report?: TargetHealthReport }) {
  const evidence = report?.evidenceJson ?? report?.evidence_json ?? {};
  const dimensions = evidence.dimensions ?? {};
  const aliasPurity = dimensions.alias_purity ?? dimensions.aliasPurity ?? {};
  const samples = asArray(aliasPurity.samples ?? aliasPurity.sampleAliases ?? aliasPurity.aliasSamples);
  const warning = healthRiskLabels(report).includes("alias_purity");
  return (
    <Panel title="Target suspicious aliases">
      {warning && <div className="cr-warning-line">targetRiskLabels 包含 alias_purity</div>}
      {samples.length ? (
        <div className="cr-mini-table">
          {samples.map((sample: any, index) => (
            <div key={index} className="cr-mini-row">
              <strong>{textValue(sample.aliasValue ?? sample.alias_value)}</strong>
              <span>{textValue(sample.normalizedAlias ?? sample.normalized_alias)}</span>
              <span>{textValue(sample.conflictingTermTypes ?? sample.conflictingTargets ?? sample.targets)}</span>
              <span>{textValue(sample.source)} / {textValue(sample.confidence)} / {textValue(sample.riskLevel)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="cr-muted">暂无可疑 alias samples</div>
      )}
    </Panel>
  );
}

function StatisticsPanel({ report }: { report?: TargetHealthReport }) {
  const dimensions = (report?.evidenceJson ?? report?.evidence_json ?? {}).dimensions ?? {};
  const valueKind = dimensions.valueKindConsistency ?? dimensions.value_kind_consistency ?? {};
  const unit = dimensions.unitConsistency ?? dimensions.unit_consistency ?? {};
  const enumPurity = dimensions.enumPurity ?? dimensions.enum_purity ?? {};
  const risky = healthRiskLabels(report).some((label) => ["unit_consistency", "value_kind_consistency", "enum_purity"].includes(label));
  return (
    <Panel title="Target valueKind/unit statistics">
      {risky && <div className="cr-warning-line">valueKind / unit / enum 健康信号存在风险</div>}
      <Info label="declared valueKind" value={valueKind.declaredValueKind ?? valueKind.declared_value_kind} />
      <Info label="observed valueKinds" value={textValue(valueKind.observedValueKinds ?? valueKind.observed_value_kinds)} />
      <Info label="unit samples" value={textValue(unit.unitSamples ?? unit.unit_samples ?? unit.samples)} />
      <Info label="missing unit count" value={unit.missingUnitCount ?? unit.missing_unit_count} />
      <Info label="unit conflict samples" value={textValue(unit.unitConflictSamples ?? unit.unit_conflict_samples)} />
      <JsonDetails title="valueKindConsistency" value={valueKind} />
      <JsonDetails title="unitConsistency" value={unit} />
      <JsonDetails title="enumPurity" value={enumPurity} />
    </Panel>
  );
}

function AffectedPanel({ resolution, report }: { resolution: ConceptResolution; report?: TargetHealthReport }) {
  const samples = affectedRecordSamples(resolution, report);
  const evidence = evidenceOf(resolution) as any;
  return (
    <Panel title="Affected records">
      <Info label="affectedRecordsCount" value={report?.affectedRecordsCount ?? samples.length} />
      <Info label="document ids" value={textValue(evidence.documentIds ?? evidence.affectedDocumentIds)} />
      <Info label="extraction ids" value={textValue(evidence.extractionIds ?? evidence.affectedExtractionIds)} />
      <JsonDetails title={`samples (${samples.length})`} value={samples} />
    </Panel>
  );
}

function BeforeAfterPanel({ resolution, target }: { resolution: ConceptResolution; target?: any }) {
  return (
    <Panel title="Examples before/after">
      <Info label="before raw field/value" value={`${candidateRawField(resolution)} / ${candidateRawValue(resolution)}`} />
      <Info label="before normalized/matched" value={`${candidateNormalizedField(resolution)} / ${candidateNormalizedValue(resolution)}`} />
      <Info label="after proposed target" value={`${textValue(target?.targetType)} ${textValue(target?.termType)} ${textValue(target?.canonicalValue ?? target?.displayName)}`} />
      <Info label="after action effect" value={recommendedActionLabel(resolution.recommendedAction)} />
    </Panel>
  );
}

function ScoringVector({ policy, targetPolicy }: { policy: any; targetPolicy: any }) {
  const vector = { ...scoringVectorOf(targetPolicy), ...scoringVectorOf(policy) };
  return (
    <>
      <Info label="trustScore" value={formatScore(vector.trustScore)} />
      <Info label="riskScore" value={formatScore(vector.riskScore)} />
      <Info label="contextScore" value={formatScore(vector.contextScore)} />
      <Info label="constraintScore" value={formatScore(vector.constraintScore)} />
      <Info label="trustTier" value={trustTierOf(policy) || trustTierOf(targetPolicy)} />
      <div className="cr-muted">trustTier 仅作为 explainability label 展示。</div>
    </>
  );
}

function ConstraintList({ constraints }: { constraints: any[] }) {
  if (!constraints.length) return <div className="cr-muted">无 hardConstraints</div>;
  return (
    <ul className="cr-constraint-list">
      {constraints.map((item, index) => (
        <li key={index}>
          <strong>{textValue(item.type ?? item.code, "constraint")}</strong>
          <span>{textValue(item.message ?? item.reason)}</span>
          {(item.blocksAutoAccept || item.blocks_auto_accept) && <span className="cr-badge cr-badge-warn">blocks auto accept</span>}
        </li>
      ))}
    </ul>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="cr-proposal-panel">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Mini({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="cr-proposal-mini">
      <span>{label}</span>
      <strong title={textValue(value)}>{textValue(value)}</strong>
    </div>
  );
}

function Info({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="cr-info-row">
      <span>{label}</span>
      <strong>{textValue(value)}</strong>
    </div>
  );
}

function JsonDetails({ title, value }: { title: string; value: unknown }) {
  return (
    <details className="cr-inline-details">
      <summary>{title}</summary>
      <pre>{json(value)}</pre>
    </details>
  );
}
