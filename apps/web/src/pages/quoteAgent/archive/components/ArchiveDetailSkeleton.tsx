import { archiveClass } from "../classNames";

export function ArchiveDetailSkeleton() {
  return (
    <div className={archiveClass("qa-archive-detail-placeholder space-y-3")}>
      <section className={archiveClass("qa-archive-panel")}>
        <div className={archiveClass("qa-archive-panel-title")}>正在加载归档合同</div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 9 }).map((_, index) => (
            <div key={index}>
              <div className="h-3 w-20 rounded bg-slate-100" />
              <div className="mt-2 h-8 rounded border border-slate-200 bg-slate-50" />
            </div>
          ))}
        </div>
      </section>
      <section className={archiveClass("qa-archive-panel")}>
        <div className="h-4 w-24 rounded bg-slate-100" />
        <div className="mt-3 space-y-2">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="h-8 rounded border border-slate-100 bg-slate-50" />
          ))}
        </div>
      </section>
    </div>
  );
}
