import { toChineseEvidenceCards } from "../utils";
import type { FrozenEvidence } from "../types";

export function ChineseEvidenceCard({ evidence }: { evidence: FrozenEvidence[] }) {
  const cards = toChineseEvidenceCards({ source: evidence });
  return <aside className="full-review-evidence" aria-label="冻结证据">
    <h2>冻结证据</h2><p className="full-review-help">只根据以下脱敏内容判断。</p>
    <div className="full-review-evidence-list">{cards.map((card, index) => <article key={`${card.originalKey}-${index}`}><span>{card.label}</span><p>{card.value}</p></article>)}</div>
    <details className="full-review-original-evidence"><summary>查看原始证据</summary>{evidence.map((item) => <section key={item.evidence_id}><b>{item.evidence_id}</b><pre>{item.content}</pre></section>)}</details>
  </aside>;
}
