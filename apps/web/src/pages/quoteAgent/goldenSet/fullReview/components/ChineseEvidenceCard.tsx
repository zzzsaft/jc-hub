import React from "react";
import { toEvidenceSections } from "../utils";
import type { FrozenEvidence } from "../types";

export function ChineseEvidenceCard({ evidence }: { evidence: FrozenEvidence[] }) {
  const sections = toEvidenceSections(evidence);
  return <aside className="full-review-evidence" aria-label="冻结证据">
    <h2>冻结证据</h2><p className="full-review-help">只根据以下脱敏内容判断。</p>
    <div className="full-review-evidence-sections">{sections.map((section) => <section className="full-review-evidence-section" key={section.evidenceId}>
      <div className="full-review-evidence-heading"><h3>{section.title}</h3><span>{section.rows.length ? `${section.rows.length} 条` : ""}</span></div>
      {section.rows.length > 0 && <table className="full-review-evidence-table">
        <thead><tr><th scope="col">{section.leftHeading}</th><th scope="col">{section.rightHeading}</th></tr></thead>
        <tbody>{section.rows.map((row, index) => <tr key={`${row.label}-${index}`}>
          <th scope="row"><strong>{row.label}</strong>{row.source && <small>{row.source}</small>}</th>
          <td>{row.choices.length > 0 ? <div className="full-review-evidence-choices">{row.choices.map((choice) => <label key={choice.label}><input type="checkbox" checked={choice.selected} disabled />{choice.label}</label>)}</div> : <><strong>{row.value}</strong>{row.detail && <small>{row.detail}</small>}</>}</td>
        </tr>)}</tbody>
      </table>}
      {section.fallbackMessage && <p className="full-review-evidence-fallback">{section.fallbackMessage}</p>}
    </section>)}</div>
    <details className="full-review-original-evidence"><summary>查看原始证据</summary>{evidence.map((item) => <section key={item.evidence_id}><b>{item.evidence_id}</b><pre>{item.content}</pre></section>)}</details>
  </aside>;
}
