import type { ConceptActionIntent, ConceptResolution, TargetHealthReport } from "../types";
import { cr } from "../classNames";
import {
  primaryTarget,
  proposalId,
  reportForTarget,
} from "../proposalReview";
import { ProposalCard } from "./ProposalCard";

type Props = {
  resolutions: ConceptResolution[];
  selectedIds: string[];
  healthReports: Record<string, TargetHealthReport>;
  loading: boolean;
  healthLoading: boolean;
  submitting: boolean;
  onToggleSelected: (id: string) => void;
  onTogglePageSelected: () => void;
  onOpenAction: (intent: ConceptActionIntent) => void;
};

export function ProposalList({
  resolutions,
  selectedIds,
  healthReports,
  loading,
  healthLoading,
  submitting,
  onToggleSelected,
  onTogglePageSelected,
  onOpenAction,
}: Props) {
  const allSelected = resolutions.length > 0 && resolutions.every((resolution) => selectedIds.includes(proposalId(resolution)));

  if (loading) {
    return (
      <div className={cr("cr-proposal-list")}>
        {Array.from({ length: 6 }).map((_, index) => <div key={index} className={cr("cr-skeleton-row")} />)}
      </div>
    );
  }

  if (!resolutions.length) {
    return (
      <div className={cr("cr-empty")}>
        <div>暂无 resolution proposals</div>
        <div className={cr("cr-empty-sub")}>调整筛选条件或重新运行 dry resolver 后再查看。</div>
      </div>
    );
  }

  return (
    <div className={cr("cr-proposal-list")}>
      <div className={cr("cr-proposal-selectbar")}>
        <label className="inline-flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={allSelected} disabled={submitting} onChange={onTogglePageSelected} />
          选择当前页
        </label>
        {healthLoading && <span className={cr("cr-muted")}>正在加载 target health report...</span>}
      </div>
      {resolutions.map((resolution) => (
        <ProposalCard
          key={proposalId(resolution)}
          resolution={resolution}
          selected={selectedIds.includes(proposalId(resolution))}
          report={reportForTarget(primaryTarget(resolution), healthReports)}
          submitting={submitting}
          onToggleSelected={() => onToggleSelected(proposalId(resolution))}
          onOpenAction={onOpenAction}
        />
      ))}
    </div>
  );
}
