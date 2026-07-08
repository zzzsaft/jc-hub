import { Modal } from "@/components/ui/core";
import type { ConceptActionIntent } from "../types";
import { proposalId } from "../proposalReview";
import { json } from "../utils";
import { cr } from "../classNames";

interface Props {
  intent: ConceptActionIntent | null;
  open: boolean;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmActionDialog({ intent, open, submitting, onCancel, onConfirm }: Props) {
  const resolutions = intent?.resolutions ?? [];
  const operations = intent?.operations ?? [];
  const highAttention = intent?.kind === "quickApprove" || intent?.kind === "approve";

  return (
    <Modal
      open={open}
      title={intent?.label ?? "确认审核动作"}
      width={720}
      onCancel={onCancel}
      footer={(
        <>
          <button className="qa-btn qa-btn-secondary" type="button" disabled={submitting} onClick={onCancel}>取消</button>
          <button className="qa-btn qa-btn-primary" type="button" disabled={submitting || operations.length === 0} onClick={onConfirm}>
            {submitting ? "提交中" : "提交"}
          </button>
        </>
      )}
    >
      <div className={cr("cr-confirm")}>
        {highAttention && (
          <div className={cr("cr-confirm-warning")}>
            将提交后端 preview operation。请确认 proposal、target health 和 hard constraints 已审核。
          </div>
        )}
        {operations.length === 0 && (
          <div className={cr("cr-confirm-warning")}>没有后端可执行操作预览，不能提交。</div>
        )}
        <div className={cr("cr-detail-grid")}>
          <div className={cr("cr-detail-cell")}><span>proposals</span><strong>{resolutions.length}</strong></div>
          <div className={cr("cr-detail-cell")}><span>operations</span><strong>{operations.length}</strong></div>
          <div className={cr("cr-detail-cell")}><span>action</span><strong>{intent?.label ?? "-"}</strong></div>
        </div>
        <div className={cr("cr-confirm-list")}>
          {resolutions.slice(0, 8).map((resolution) => <code key={proposalId(resolution)}>{proposalId(resolution)}</code>)}
          {resolutions.length > 8 && <span className={cr("cr-muted")}>还有 {resolutions.length - 8} 个</span>}
        </div>
        <details className={cr("cr-inline-details")}>
          <summary>operations JSON</summary>
          <pre>{json(operations)}</pre>
        </details>
      </div>
    </Modal>
  );
}
