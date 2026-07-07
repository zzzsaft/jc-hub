import { useMemo, useState } from "react";
import { CopyOutlined } from "@/components/ui/icons";
import { fieldLabels } from "../constants";
import { crText } from "../locales";
import type { ConceptPatternReview, ConceptResolution } from "../types";
import {
  actionLabel,
  asArray,
  candidateTypeLabel,
  copyPatternKey,
  evidenceOf,
  formatScore,
  isQueueOnlyAction,
  normalizeResolution,
  recommendedActionLabel,
  relationTypeLabel,
  riskLabel,
  routeLabel,
  textValue,
} from "../utils";
import { CandidateSamplesTab } from "./CandidateSamplesTab";
import { EvidenceTab } from "./EvidenceTab";
import { IssuesTab } from "./IssuesTab";
import { MatchedTargetsTab } from "./MatchedTargetsTab";

interface Props {
  pattern: ConceptPatternReview | null;
  resolutions: ConceptResolution[];
  loading: boolean;
  submitting: boolean;
  onOpenAction: (pattern: ConceptPatternReview, kind: "review" | "apply") => void;
}

const tabs = [
  { key: "evidence", label: crText.detail.tabs.evidence },
  { key: "targets", label: crText.detail.tabs.targets },
  { key: "issues", label: crText.detail.tabs.issues },
  { key: "samples", label: crText.detail.tabs.samples },
];

export function DetailPanel({ pattern, resolutions, loading, submitting, onOpenAction }: Props) {
  const [activeTab, setActiveTab] = useState("evidence");
  const [copied, setCopied] = useState(false);
  const primary = useMemo(() => normalizeResolution(resolutions[0] ?? pattern?.primaryResolution ?? {}), [pattern, resolutions]);
  const evidence = evidenceOf(primary);

  if (!pattern) {
    return <aside className="cr-detail cr-empty">{crText.detail.empty}</aside>;
  }

  const handleCopy = async () => {
    const ok = await copyPatternKey(pattern.patternKey);
    setCopied(ok);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <aside className="cr-detail">
      <div className="cr-detail-header">
        <div className="min-w-0">
          <h2>{crText.detail.title}</h2>
          <div className="cr-muted cr-clamp" title={pattern.patternKey}>{pattern.patternKey}</div>
        </div>
        <button className="qa-btn qa-btn-quiet qa-btn-sm" type="button" onClick={handleCopy}>
          <CopyOutlined /> {copied ? crText.detail.copied : crText.detail.copy}
        </button>
      </div>

      <div className="cr-detail-grid">
        {[
          ["candidateType", candidateTypeLabel(pattern.candidateType)],
          ["relationType", relationTypeLabel(pattern.relationType)],
          ["recommendedAction", recommendedActionLabel(pattern.recommendedAction)],
          ["route", routeLabel(pattern.route)],
          ["riskLevel", riskLabel(pattern.riskLevel)],
          ["avgScore", formatScore(pattern.avgScore)],
          ["candidateCount", pattern.candidateCount],
          ["dictionaryVersion", evidence.dictionaryVersion],
        ].map(([label, value]) => (
          <div key={String(label)} className="cr-detail-cell">
            <span>{fieldLabels[String(label)] ?? label}</span>
            <strong title={textValue(value)}>{textValue(value)}</strong>
          </div>
        ))}
      </div>

      <section className="cr-section">
        <h3>{crText.detail.reasonTitle}</h3>
        <p>
          {loading
            ? crText.detail.loadingEvidence
            : textValue(primary.reason ?? pattern.primaryResolution?.reason, crText.detail.noEvidence)}
        </p>
      </section>

      <section className="cr-action-panel">
        <div>
          <strong>{actionLabel(pattern)}</strong>
          <p>
            {isQueueOnlyAction(pattern)
              ? crText.detail.queueOnlyHint
              : crText.detail.queueApplyHint}
          </p>
        </div>
        <div className="cr-action-buttons">
          <button className="qa-btn qa-btn-secondary qa-btn-sm" type="button" disabled={submitting} onClick={() => onOpenAction(pattern, "review")}>
            {crText.detail.markReviewed}
          </button>
          <button className="qa-btn qa-btn-primary qa-btn-sm" type="button" disabled={submitting} onClick={() => onOpenAction(pattern, "apply")}>
            {crText.detail.queueCandidates}
          </button>
        </div>
      </section>

      <div className="qa-review-tabs cr-tabs" role="tablist" aria-label={crText.detail.tabsAria}>
        <div className="qa-review-tabs-track">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className="qa-review-tab"
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
              {tab.key === "targets" && <span className="cr-tab-count">{asArray(primary.matchedTargets).length}</span>}
              {tab.key === "issues" && <span className="cr-tab-count">{asArray(primary.issues).length}</span>}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "evidence" && <EvidenceTab resolution={primary} />}
      {activeTab === "targets" && <MatchedTargetsTab resolution={primary} />}
      {activeTab === "issues" && <IssuesTab resolution={primary} />}
      {activeTab === "samples" && <CandidateSamplesTab resolution={primary} />}
    </aside>
  );
}
