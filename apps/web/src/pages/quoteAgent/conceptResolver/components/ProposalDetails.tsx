import type { ConceptResolution, TargetHealthReport } from "../types";
import { cr } from "../classNames";
import {
  affectedRecordSamples,
  candidateNormalizedField,
  candidateNormalizedValue,
  candidateRawField,
  candidateRawValue,
  hardConstraintsOf,
  healthRiskLabels,
  policyEvaluationOf,
  scoringVectorOf,
  trustTierOf,
  unifiedScoreOf,
} from "../proposalReview";
import {
  asArray,
  evidenceOf,
  formatDateTime,
  formatScore,
  recommendedActionLabel,
  textValue,
} from "../utils";
import {
  Info,
  JsonDetails,
  Panel,
} from "./ProposalShared";

export function ProposalDetails({
  resolution,
  report,
  target,
}: {
  resolution: ConceptResolution;
  report?: TargetHealthReport;
  target?: any;
}) {
  const policy = policyEvaluationOf(resolution);
  const targetPolicy = policyEvaluationOf(target);
  return (
    <details className={cr("cr-proposal-details")}>
      <summary>展开审核证据、健康信号和应用示例</summary>
      <div className={cr("cr-proposal-detail-grid")}>
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
  );
}

function HealthPanel({ report }: { report?: TargetHealthReport }) {
  const evidence = report?.evidenceJson ?? report?.evidence_json ?? {};
  if (!report) {
    return <Panel title="Target health report"><div className={cr("cr-muted")}>暂无 health report</div></Panel>;
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
      {warning && <div className={cr("cr-warning-line")}>targetRiskLabels 包含 alias_purity</div>}
      {samples.length ? (
        <div className={cr("cr-mini-table")}>
          {samples.map((sample: any, index) => (
            <div key={index} className={cr("cr-mini-row")}>
              <strong>{textValue(sample.aliasValue ?? sample.alias_value)}</strong>
              <span>{textValue(sample.normalizedAlias ?? sample.normalized_alias)}</span>
              <span>{textValue(sample.conflictingTermTypes ?? sample.conflictingTargets ?? sample.targets)}</span>
              <span>{textValue(sample.source)} / {textValue(sample.confidence)} / {textValue(sample.riskLevel)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className={cr("cr-muted")}>暂无可疑 alias samples</div>
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
      {risky && <div className={cr("cr-warning-line")}>valueKind / unit / enum 健康信号存在风险</div>}
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
      <div className={cr("cr-muted")}>trustTier 仅作为 explainability label 展示。</div>
    </>
  );
}

function ConstraintList({ constraints }: { constraints: any[] }) {
  if (!constraints.length) return <div className={cr("cr-muted")}>无 hardConstraints</div>;
  return (
    <ul className={cr("cr-constraint-list")}>
      {constraints.map((item, index) => (
        <li key={index}>
          <strong>{textValue(item.type ?? item.code, "constraint")}</strong>
          <span>{textValue(item.message ?? item.reason)}</span>
          {(item.blocksAutoAccept || item.blocks_auto_accept) && <span className={cr("cr-badge cr-badge-warn")}>blocks auto accept</span>}
        </li>
      ))}
    </ul>
  );
}
