import { crText } from "../locales";
import type { ConceptResolution } from "../types";
import { asArray, formatScore, json, normalizeResolution, textValue } from "../utils";
import { cr } from "../classNames";

interface Props {
  resolution?: ConceptResolution | null;
}

export function MatchedTargetsTab({ resolution }: Props) {
  const targets = asArray(normalizeResolution(resolution ?? {}).matchedTargets);

  if (!targets.length) {
    return <div className={cr("cr-empty cr-empty-compact")}>{crText.targets.empty}</div>;
  }

  return (
    <div className={cr("cr-table-shell cr-table-compact")}>
      <table className={cr("cr-table")}>
        <thead>
          <tr>
            <th>{crText.targets.target}</th>
            <th>{crText.targets.termValue}</th>
            <th>{crText.targets.display}</th>
            <th>{crText.targets.score}</th>
            <th>{crText.targets.evidence}</th>
          </tr>
        </thead>
        <tbody>
          {targets.map((target, index) => (
            <tr key={`${target.id ?? index}:${index}`}>
              <td>{textValue(target.targetType)}</td>
              <td>
                <div className={cr("cr-strong")}>{textValue(target.termType)}</div>
                <div className={cr("cr-muted")}>{textValue(target.canonicalValue)}</div>
              </td>
              <td>{textValue(target.displayName)}</td>
              <td>{formatScore(target.score)}</td>
              <td>
                <details className={cr("cr-inline-details")}>
                  <summary>JSON</summary>
                  <pre>{json(target.evidence)}</pre>
                </details>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
