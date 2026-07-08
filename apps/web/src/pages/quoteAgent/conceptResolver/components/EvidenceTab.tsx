import { evidenceKeyLabels } from "../constants";
import { crText } from "../locales";
import type { ConceptResolution } from "../types";
import { asArray, evidenceOf, json, recommendedActionLabel, relationTypeLabel, textValue } from "../utils";
import { cr } from "../classNames";

interface Props {
  resolution?: ConceptResolution | null;
}

const evidenceEntries = (value: Record<string, unknown> | undefined) =>
  Object.entries(value ?? {}).filter(([, item]) => item !== undefined && item !== null && item !== "");

export function EvidenceTab({ resolution }: Props) {
  const evidence = evidenceOf(resolution);
  const positive = evidenceEntries(evidence.positive);
  const negative = evidenceEntries(evidence.negative);
  const ruleSignals = asArray(evidence.ruleSignals);

  return (
    <div className={cr("cr-tab-body")}>
      <div className={cr("cr-evidence-grid")}>
        <section>
          <h4>{crText.evidence.positive}</h4>
          {positive.length ? positive.map(([key, value]) => (
            <div key={key} className={cr("cr-kv-row")}>
              <span title={key}>{evidenceKeyLabels[key] ?? key}</span>
              <strong>{textValue(value)}</strong>
            </div>
          )) : <div className={cr("cr-muted")}>{crText.evidence.noPositive}</div>}
        </section>
        <section>
          <h4>{crText.evidence.negative}</h4>
          {negative.length ? negative.map(([key, value]) => (
            <div key={key} className={cr("cr-kv-row")}>
              <span title={key}>{evidenceKeyLabels[key] ?? key}</span>
              <strong>{textValue(value)}</strong>
            </div>
          )) : <div className={cr("cr-muted")}>{crText.evidence.noNegative}</div>}
        </section>
      </div>
      <section className={cr("cr-section")}>
        <h4>{crText.evidence.ruleSignals}</h4>
        {ruleSignals.length ? (
          <div className={cr("cr-list")}>
            {ruleSignals.map((signal, index) => (
              <div key={index} className={cr("cr-list-item")}>
                <div className={cr("cr-strong")}>{textValue(signal.ruleId ?? signal.message)}</div>
                <div className={cr("cr-muted")}>{relationTypeLabel(signal.relationType)} / {recommendedActionLabel(signal.recommendedAction)} / {textValue(signal.confidence)}</div>
              </div>
            ))}
          </div>
        ) : <div className={cr("cr-muted")}>{crText.evidence.noRuleSignals}</div>}
      </section>
      <details className={cr("cr-json-details")}>
        <summary>{crText.evidence.rawJson}</summary>
        <pre>{json(evidence)}</pre>
      </details>
    </div>
  );
}
