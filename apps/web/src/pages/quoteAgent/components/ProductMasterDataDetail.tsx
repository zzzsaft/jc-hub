import type { ProductMasterDataCandidate } from "../types";
import {
  modelOf,
  valueOf,
} from "./ProductMasterDataPanel.utils";

export function MasterDataDetail(props: {
  detailFields: Array<{ keys: readonly string[]; label: string }>;
  record: ProductMasterDataCandidate;
  source: string;
  compact?: boolean;
}) {
  return (
    <div className={props.compact ? "space-y-2" : "mt-3 space-y-2"}>
      <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
        <DetailCell label="来源表" value={props.source} />
        <DetailCell label="型号" value={modelOf(props.record) || "-"} />
        {props.record.name && <DetailCell label="名称" value={props.record.name} />}
      </div>
      <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
        {props.detailFields.map((field) => (
          <DetailCell key={field.label} label={field.label} value={valueOf(props.record, field.keys) || "-"} />
        ))}
      </div>
    </div>
  );
}

function DetailCell({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0 border border-slate-200 bg-white px-2 py-1.5">
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className="mt-0.5 break-words text-slate-800">{String(value || "-")}</div>
    </div>
  );
}
