import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { quoteAgentService } from "../services/quoteAgent.service";
import type {
  ProductMasterDataCandidate,
  ProductMasterDataTermType,
  QuoteAgentField,
  QuoteAgentItem,
} from "../types";
import { errorText, productMasterDataMatch, productMasterDataNoMatchWarning } from "../utils";

interface Props {
  field: QuoteAgentField;
  item: QuoteAgentItem;
  termType: ProductMasterDataTermType;
  documentId?: string | number;
  extractionResultId?: string | number;
}

const sourceTable: Record<ProductMasterDataTermType, "crm_products_pump" | "crm_product_filter"> = {
  metering_pump_model: "crm_products_pump",
  filter_model: "crm_product_filter",
};

const termLabel: Record<ProductMasterDataTermType, string> = {
  metering_pump_model: "计量泵型号",
  filter_model: "过滤器型号",
};

const pumpColumns = [
  { key: "model", label: "model" },
  { key: "pumpage", label: "pumpage" },
  { key: "rotateSpeed", label: "rotateSpeed" },
  { key: "heatingPower", label: "heatingPower" },
  { key: "shearSensitivity", label: "shearSensitivity" },
  { key: "production", label: "production" },
] as const;

const filterColumns = [
  { key: "model", label: "model" },
  { key: "name", label: "name" },
  { key: "filterBoard", label: "filterBoard" },
  { key: "production", label: "production" },
  { key: "dimension", label: "dimension" },
  { key: "effectiveFilterArea", label: "effectiveFilterArea" },
  { key: "power", label: "power" },
  { key: "pressure", label: "pressure" },
] as const;

const pumpDetailFields = [
  { keys: ["pumpage", "pumpage_value", "displacement"], label: "排量" },
  { keys: ["rotateSpeed", "rotate_speed"], label: "转速" },
  { keys: ["heatingPower", "heating_power"], label: "加热功率" },
  { keys: ["shearSensitivity", "shear_sensitivity", "materialFeature", "material_feature"], label: "材料特性" },
  { keys: ["production"], label: "产量" },
];

const filterDetailFields = [
  { keys: ["filterBoard", "filter_board"], label: "过滤板" },
  { keys: ["production"], label: "产量" },
  { keys: ["dimension", "size"], label: "尺寸" },
  { keys: ["weight"], label: "重量" },
  { keys: ["meshDiameter", "mesh_diameter", "filterMeshDiameter", "filter_mesh_diameter"], label: "滤网直径" },
  { keys: ["effectiveFilterArea", "effective_filter_area"], label: "有效过滤面积" },
  { keys: ["power"], label: "功率" },
  { keys: ["pressure"], label: "压力" },
];

function valueOf(source: Record<string, any> | null | undefined, keys: readonly string[]) {
  if (!source) return "";
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && value !== "") return String(value);
  }
  return "";
}

function modelOf(source: Record<string, any> | null | undefined) {
  return valueOf(source, ["model", "productModel", "product_model", "matchedModel", "matched_model"]);
}

function normalizeCandidate(candidate: ProductMasterDataCandidate): ProductMasterDataCandidate {
  return {
    ...candidate,
    model: modelOf(candidate) || candidate.model,
    rotateSpeed: candidate.rotateSpeed ?? candidate.rotate_speed,
    heatingPower: candidate.heatingPower ?? candidate.heating_power,
    shearSensitivity: candidate.shearSensitivity ?? candidate.shear_sensitivity,
    filterBoard: candidate.filterBoard ?? candidate.filter_board,
    meshDiameter: candidate.meshDiameter ?? candidate.mesh_diameter,
    effectiveFilterArea: candidate.effectiveFilterArea ?? candidate.effective_filter_area,
  };
}

function matchRecord(match: Record<string, any> | null) {
  if (!match) return null;
  const record = match.record || match.data || match.product || match.masterData || match.master_data || match.matchedRecord || match.matched_record || match;
  return normalizeCandidate(record);
}

function sourceOf(match: Record<string, any> | null, termType: ProductMasterDataTermType) {
  return String(match?.sourceTable || match?.source_table || match?.table || sourceTable[termType]);
}

function candidateKey(candidate: ProductMasterDataCandidate, index: number) {
  return String(candidate.id ?? candidate.model ?? index);
}

export function ProductMasterDataPanel({ field, item, termType, documentId, extractionResultId }: Props) {
  const rawValue = String(field.raw_value || "");
  const match = productMasterDataMatch(field);
  const noMatchWarning = productMasterDataNoMatchWarning(field);
  const matchedRecord = useMemo(() => matchRecord(match), [match]);
  const [query, setQuery] = useState(rawValue);
  const [results, setResults] = useState<ProductMasterDataCandidate[]>([]);
  const [selected, setSelected] = useState<ProductMasterDataCandidate | null>(null);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [binding, setBinding] = useState(false);
  const [message, setMessage] = useState("");
  const autoSearchKeyRef = useRef("");
  const autoBindingKeyRef = useRef("");

  const columns = termType === "metering_pump_model" ? pumpColumns : filterColumns;
  const detailFields = termType === "metering_pump_model" ? pumpDetailFields : filterDetailFields;
  const selectedRecord = selected ? normalizeCandidate(selected) : null;

  const bindRecord = useCallback(async (record: ProductMasterDataCandidate, auto = false) => {
    const normalizedRecord = normalizeCandidate(record);
    const bindingKey = `${termType}:${documentId ?? ""}:${item.item_index ?? ""}:${rawValue}:${normalizedRecord.id ?? normalizedRecord.model ?? ""}`;
    if (auto && autoBindingKeyRef.current === bindingKey) return;
    if (auto) autoBindingKeyRef.current = bindingKey;
    setBinding(true);
    setMessage("");
    try {
      await quoteAgentService.bindProductModel({
        termType,
        rawValue,
        fieldName: field.field_name,
        itemIndex: item.item_index,
        documentId,
        extractionResultId,
        sourceTable: sourceTable[termType],
        masterDataId: normalizedRecord.id,
        model: normalizedRecord.model,
        candidate: normalizedRecord,
      });
      setSelected(normalizedRecord);
      setMessage(auto ? "只找到 1 条产品主数据，已自动绑定。" : "已确认绑定产品主数据。");
    } catch (error) {
      const status = (error as any)?.response?.status;
      setMessage(
        status === 404 || status === 405
          ? "绑定接口暂不可用，已保留当前候选选择。"
          : `绑定失败：${errorText(error)}`,
      );
    } finally {
      setBinding(false);
    }
  }, [documentId, extractionResultId, field.field_name, item.item_index, rawValue, termType]);

  const search = useCallback(async (autoBindSingle = false) => {
    const keyword = query.trim();
    if (!keyword) return;
    setSearching(true);
    setSearched(true);
    setMessage("");
    try {
      const items = (await quoteAgentService.searchProductMasterData(termType, keyword)).map(normalizeCandidate);
      setResults(items);
      setSelected(null);
      if (items.length === 1) {
        setSelected(items[0]);
        if (autoBindSingle) await bindRecord(items[0], true);
      }
      if (!items.length) setMessage("未找到匹配的产品主数据，可换一个型号关键词再试。");
    } catch (error) {
      setResults([]);
      setMessage(`搜索失败：${errorText(error)}`);
    } finally {
      setSearching(false);
    }
  }, [bindRecord, query, termType]);

  useEffect(() => {
    if (match?.matched || !rawValue.trim()) return;
    const key = `${termType}:${documentId ?? ""}:${item.item_index ?? ""}:${rawValue}`;
    if (autoSearchKeyRef.current === key) return;
    autoSearchKeyRef.current = key;
    void search(true);
  }, [documentId, item.item_index, match?.matched, rawValue, search, termType]);

  const bind = async () => {
    if (!selectedRecord) return;
    await bindRecord(selectedRecord);
  };

  return (
    <section className="col-span-full border border-blue-200 bg-blue-50/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-900">产品主数据匹配</div>
          <div className="mt-0.5 text-xs text-slate-500">
            {termLabel[termType]} · 来源表 {sourceTable[termType]}
          </div>
        </div>
        {match?.matched ? (
          <span className="border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">已匹配</span>
        ) : (
          <span className="border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">待人工选择</span>
        )}
      </div>

      {match?.matched && matchedRecord ? (
        <MasterDataDetail
          detailFields={detailFields}
          record={matchedRecord}
          source={sourceOf(match, termType)}
        />
      ) : (
        <div className="mt-3 space-y-3">
          <div className="border border-amber-200 bg-white px-3 py-2 text-xs text-amber-700">
            {noMatchWarning ? "未匹配到产品主数据" : "当前型号需要从产品主数据中选择"}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              className="box-border h-8 min-w-0 flex-1 border border-slate-300 bg-white px-2 text-xs outline-none focus:border-blue-500"
              value={query}
              placeholder="输入型号搜索"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") search();
              }}
            />
            <button className="qa-btn qa-btn-primary qa-btn-sm" type="button" onClick={() => search()} disabled={searching || !query.trim()}>
              {searching ? "搜索中" : "搜索主数据"}
            </button>
          </div>

          {searched && (
            <div className="overflow-x-auto border border-slate-200 bg-white">
              {results.length ? (
                <table className="min-w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="w-20 px-2 py-2 font-medium">选择</th>
                      {columns.map((column) => (
                        <th key={column.key} className="px-2 py-2 font-medium">{column.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {results.map((candidate, index) => (
                      <tr key={candidateKey(candidate, index)} className={selected === candidate ? "bg-blue-50" : "bg-white"}>
                        <td className="px-2 py-2">
                          <button className="qa-btn qa-btn-secondary qa-btn-sm" type="button" onClick={() => setSelected(candidate)}>
                            选择
                          </button>
                        </td>
                        {columns.map((column) => (
                          <td key={column.key} className="max-w-44 px-2 py-2 text-slate-700">
                            <span className="line-clamp-2 break-words">{String((candidate as any)[column.key] ?? "-")}</span>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="px-3 py-4 text-center text-xs text-slate-500">未找到候选产品主数据</div>
              )}
            </div>
          )}

          {selectedRecord && (
            <div className="space-y-3 border border-blue-200 bg-white p-3">
              <div className="text-xs font-semibold text-slate-900">候选明细预览</div>
              <MasterDataDetail detailFields={detailFields} record={selectedRecord} source={sourceTable[termType]} compact />
              <button className="qa-btn qa-btn-primary qa-btn-sm" type="button" onClick={bind} disabled={binding}>
                {binding ? "绑定中" : "确认绑定"}
              </button>
            </div>
          )}
        </div>
      )}

      {message && <div className="mt-3 border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">{message}</div>}
    </section>
  );
}

function MasterDataDetail(props: {
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
