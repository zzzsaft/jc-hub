import { HistoryOutlined } from "@/components/ui/icons";
import type { ContractArchiveVersion } from "../../types";
import { changeSummaryDetails, changeSummaryText, formatDateTime } from "../../utils";
import { archiveClass } from "../classNames";

type Props = {
  title?: string;
  versions: ContractArchiveVersion[];
  activeVersion?: number | null;
  onOpen: (version: ContractArchiveVersion) => void;
};

export function VersionHistoryPanel({ title = "版本历史", versions, activeVersion, onOpen }: Props) {
  return (
    <aside className={archiveClass("qa-archive-panel qa-archive-detail-log-panel")}>
      <div className={archiveClass("qa-archive-panel-title")}>{title}</div>
      <div className={archiveClass("qa-version-list mt-2 space-y-3")}>
        {versions.map((version) => {
          const details = changeSummaryDetails(version.changeSummary);
          return (
            <article
              key={version.id}
              className={archiveClass([
                "qa-version-card rounded-md border px-2.5 py-2.5 text-left text-sm shadow-sm",
                activeVersion === version.version
                  ? "border-blue-300 bg-blue-50 text-blue-800 ring-1 ring-blue-100"
                  : "border-slate-300 bg-white text-slate-700 ring-1 ring-slate-100",
              ].join(" "))}
            >
              <div className="flex min-w-0 items-center justify-between gap-2">
                <span className="shrink-0 font-semibold">v{version.version}</span>
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="min-w-0 truncate text-xs text-slate-500">{formatDateTime(version.createdAt)}</span>
                  <button
                    type="button"
                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-transparent bg-transparent text-slate-400 hover:bg-slate-100 hover:text-blue-700"
                    title="查看历史版本"
                    aria-label={`查看 v${version.version} 历史版本`}
                    onClick={() => onOpen(version)}
                  >
                    <HistoryOutlined className="text-sm" />
                  </button>
                </div>
              </div>
              <div className="mt-1 text-xs text-slate-500">编辑人：{version.editedBy || "-"}</div>
              {details.length ? (
                <div className="mt-2 space-y-2 text-xs text-slate-600">
                  <div>有{details.length}处更改</div>
                  {details.slice(0, 4).map((detail, index) => (
                    <div key={`${detail.label}-${index}`} className="space-y-1">
                      <div className="font-medium text-slate-600">{detail.label}：</div>
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <span className={archiveClass("qa-version-value-chip rounded bg-rose-50 px-2 py-1 text-rose-700")}>{detail.before}</span>
                        <span className="text-slate-400">→</span>
                        <span className={archiveClass("qa-version-value-chip rounded bg-emerald-50 px-2 py-1 text-emerald-700")}>{detail.after}</span>
                      </div>
                    </div>
                  ))}
                  {details.length > 4 && <div className="text-slate-400">还有 {details.length - 4} 处更改...</div>}
                </div>
              ) : (
                <div className="mt-1 line-clamp-2 text-xs text-slate-500">{changeSummaryText(version.changeSummary)}</div>
              )}
            </article>
          );
        })}
        {!versions.length && <div className={archiveClass("qa-archive-empty")}>暂无版本</div>}
      </div>
    </aside>
  );
}
