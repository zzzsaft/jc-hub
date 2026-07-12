import type { FullReviewTask } from "../types";

export function ReviewHeader({ task }: { task: FullReviewTask }) {
  return <header className="full-review-header">
    <div><p className="full-review-eyebrow">完整文档盲审</p><h1>Golden Set 全量复核</h1></div>
    <dl><div><dt>文档</dt><dd>{task.document_id}</dd></div><div><dt>分组</dt><dd>{task.cohort === "calibration" ? "校准" : "验收"}</dd></div><div><dt>修订</dt><dd>{task.revision}</dd></div></dl>
  </header>;
}
