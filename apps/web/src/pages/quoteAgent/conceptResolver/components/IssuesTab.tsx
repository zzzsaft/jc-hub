import { crText } from "../locales";
import type { ConceptResolution } from "../types";
import { asArray, json, normalizeResolution, recommendedActionLabel, relationTypeLabel, riskLabel, textValue } from "../utils";
import { cr } from "../classNames";

interface Props {
  resolution?: ConceptResolution | null;
}

export function IssuesTab({ resolution }: Props) {
  const issues = asArray(normalizeResolution(resolution ?? {}).issues);

  if (!issues.length) {
    return <div className={cr("cr-empty cr-empty-compact")}>{crText.issues.empty}</div>;
  }

  return (
    <div className={cr("cr-list")}>
      {issues.map((issue, index) => (
        <article key={index} className={cr("cr-list-item")}>
          <div className={cr("cr-list-top")}>
            <span className={cr("cr-badge", `cr-risk-${textValue(issue.riskLevel, "unknown")}`)} title={textValue(issue.riskLevel)}>{riskLabel(issue.riskLevel)}</span>
            <strong>{textValue(issue.detector)}</strong>
          </div>
          <div className={cr("cr-muted")}>{relationTypeLabel(issue.relationType)} / {recommendedActionLabel(issue.recommendedAction)}</div>
          <p>{textValue(issue.reason)}</p>
          <details className={cr("cr-inline-details")}>
            <summary>{crText.issues.evidenceJson}</summary>
            <pre>{json(issue.evidence)}</pre>
          </details>
        </article>
      ))}
    </div>
  );
}
