import { crText } from "../locales";
import type { ConceptResolution } from "../types";
import { asArray, evidenceOf, textValue } from "../utils";
import { cr } from "../classNames";

interface Props {
  resolution?: ConceptResolution | null;
}

export function CandidateSamplesTab({ resolution }: Props) {
  const samples = asArray(evidenceOf(resolution).sampleOccurrences);

  if (!samples.length) {
    return <div className={cr("cr-empty cr-empty-compact")}>{crText.samples.empty}</div>;
  }

  return (
    <div className={cr("cr-table-shell cr-table-compact")}>
      <table className={cr("cr-table")}>
        <thead>
          <tr>
            <th>{crText.samples.rawField}</th>
            <th>{crText.samples.rawValue}</th>
            <th>{crText.samples.normalized}</th>
            <th>{crText.samples.productType}</th>
            <th>{crText.samples.document}</th>
            <th>{crText.samples.countStatus}</th>
          </tr>
        </thead>
        <tbody>
          {samples.map((sample: any, index) => (
            <tr key={index}>
              <td><div className={cr("cr-clamp")} title={textValue(sample.rawFieldName ?? sample.rawField ?? sample.fieldName)}>{textValue(sample.rawFieldName ?? sample.rawField ?? sample.fieldName)}</div></td>
              <td><div className={cr("cr-clamp")} title={textValue(sample.rawValue)}>{textValue(sample.rawValue)}</div></td>
              <td><div className={cr("cr-clamp")} title={textValue(sample.normalizedValue)}>{textValue(sample.normalizedValue)}</div></td>
              <td>{textValue(sample.sourceProductType)}</td>
              <td>{textValue(sample.documentId ?? sample.document)}</td>
              <td>{textValue(sample.occurrenceCount ?? sample.status ?? sample.historicalStatus)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
