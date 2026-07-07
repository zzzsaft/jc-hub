import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckSquareOutlined, CloseCircleOutlined, EditOutlined } from "@/components/ui/icons";
import { useArchiveDetailState } from "../hooks/useArchiveDetailState";
import { FieldTable } from "./FieldTable";
import { JsonBlock } from "./JsonBlock";
import { DerivedMasterDataModelRow, MasterDataStatus } from "./MasterDataStatus";
import { ProductBindingsEditor } from "./ProductBindingsEditor";
import { VersionHistoryPanel } from "./VersionHistoryPanel";
import { ArchiveDetailSkeleton } from "./ArchiveDetailSkeleton";
import type { ArchiveItemField, ContractArchiveDetail, DictionaryOptions, QuoteAgentField } from "../../types";
import { isMainConfigField, isUnmatchedConfigField, textValue } from "../../utils";
import { archiveClass } from "../classNames";

const importantDocInfoKeys = [
  "business_owner",
  "contract_creator",
  "product_number",
  "contract_number",
  "order_number",
  "customer",
  "customer_name",
  "customer_id",
  "date",
  "country",
  "order_date",
  "delivery_date",
];

const docInfoLabels: Record<string, string> = {
  product_number: "产品编号",
  contract_number: "合同编号",
  order_number: "订单编号",
  customer: "客户",
  customer_name: "客户",
  customer_id: "客户编号",
  date: "日期",
  country: "国家/地区",
  order_date: "下单日期",
  delivery_date: "交货日期",
  shipment_date: "发货日期",
  usage_market: "使用市场",
  business_owner: "业务接单人",
  completion_date: "完成日期",
  contract_creator: "合同制作人",
  delivery_date_contract: "合同交货日期",
};

type ArchiveDetailPageProps = {
  archiveId?: string | number;
  modal?: boolean;
  onClose?: () => void;
};

export function ArchiveDetailPage({ archiveId, modal = false, onClose }: ArchiveDetailPageProps = {}) {
  const state = useArchiveDetailState(archiveId);
  const archive = state.historySnapshot || state.archive;
  const [editMode, setEditMode] = useState(false);
  const viewingHistory = Boolean(state.historySnapshot);
  const editable = editMode && !viewingHistory;

  return (
    <div className={modal ? archiveClass("qa-archive-detail-page qa-archive-detail-page-modal") : archiveClass("qa-archive-page qa-archive-detail-page")}>
      <div className={archiveClass("qa-archive-detail-shell")}>
        <div className={archiveClass("qa-archive-detail-topbar")}>
          <div className="min-w-0">
            {modal ? null : <Link className={archiveClass("qa-archive-link")} to="/agent/archive">返回合同列表</Link>}
            <h1 className={archiveClass("qa-archive-title")}>{textValue(archive?.fileName, "归档合同")}</h1>
            <p className={archiveClass("qa-archive-subtitle")}>
              archive #{state.archiveId} · 当前版本 {state.archive?.currentVersion ? `v${state.archive.currentVersion}` : "-"}
              {viewingHistory && state.historyVersion ? ` · 正在查看历史 v${state.historyVersion.version}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {viewingHistory && <button type="button" className="qa-btn qa-btn-secondary" onClick={state.closeHistory}>返回当前版本</button>}
            {!viewingHistory && (
              <button type="button" className={editable ? "qa-btn qa-btn-secondary" : "qa-btn qa-btn-primary"} onClick={() => setEditMode((current) => !current)}>
                {editable ? "查看" : "编辑"}
              </button>
            )}
            <button type="button" className="qa-btn qa-btn-primary" disabled={!editable || state.saving || state.unsavedCount === 0} onClick={state.saveChanges}>
              {state.saving ? "保存中" : `保存修改${state.unsavedCount ? ` (${state.unsavedCount})` : ""}`}
            </button>
            {modal && (
              <button type="button" className="qa-btn qa-btn-quiet" title="关闭" aria-label="关闭" onClick={onClose}>
                <CloseCircleOutlined />
              </button>
            )}
          </div>
        </div>

        <div className={archiveClass("qa-archive-detail-body")}>
          <main className={archiveClass("qa-archive-detail-main")}>
            {state.error && <div className={archiveClass("qa-archive-error")}>操作失败：{state.error}</div>}
            {state.message && <div className={archiveClass("qa-archive-success")}>{state.message}</div>}
            {state.unsavedCount > 0 && <div className={archiveClass("qa-archive-warning")}>有 {state.unsavedCount} 项未保存修改。</div>}

            {state.loading ? (
              <ArchiveDetailSkeleton />
            ) : !archive ? (
              <div className={archiveClass("qa-archive-panel qa-archive-detail-placeholder qa-archive-empty")}>未找到归档合同</div>
            ) : (
              <div className="space-y-3">
                <ArchiveDocInfo archive={archive} readonly={!editable} onChange={state.updateField} />
                {archive.items?.map((item, index) => (
                  <article key={item.id} className={archiveClass("qa-archive-panel")}>
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-semibold text-slate-900">明细 {item.itemIndex}</div>
                          <MasterDataStatus item={item} />
                        </div>
                        {!editable ? (
                          <div className="mt-1 text-sm text-slate-600">{textValue(item.itemName)}</div>
                        ) : (
                          <input
                            className={archiveClass("qa-archive-input mt-1 max-w-xl")}
                            value={textValue(item.itemName, "")}
                            placeholder="明细名称"
                            onChange={(event) => state.updateField(`items.${index}.itemName`, event.target.value)}
                          />
                        )}
                        <div className="mt-1 text-xs text-slate-500">
                          类型：{textValue(item.productTypeDisplayName || item.productTypeHint)} · 来源产品编号：{textValue(item.sourceProductNumber)}
                        </div>
                      </div>
                      <JsonBlock title=" 明细 JSON" value={item} />
                    </div>

                    <div className="space-y-3">
                      <div>
                        <div className={archiveClass("qa-archive-section-title")}>配置字段</div>
                        <DerivedMasterDataModelRow item={item} />
                        <FieldTable
                          fields={item.fields ?? []}
                          basePath={`items.${index}.fields`}
                          dictionaryOptions={state.dictionaryOptions}
                          dirtyFieldIndexes={state.dirtyFieldKeys
                            .filter((key) => key.startsWith(`items.${index}.fields:`))
                            .map((key) => Number(key.split(":").at(-1)))
                            .filter((fieldIndex) => Number.isFinite(fieldIndex))}
                          editable={editable}
                          onChange={state.updateField}
                        />
                      </div>
                      <HiddenFieldsDisclosure
                        fields={item.fields ?? []}
                        dictionaryOptions={state.dictionaryOptions}
                      />
                      <div>
                        <div className={archiveClass("qa-archive-section-title")}>产品编号绑定</div>
                        {!editable ? (
                          <JsonBlock title=" 产品编号绑定" value={item.productBindings ?? []} defaultOpen />
                        ) : (
                          <ProductBindingsEditor
                            item={item}
                            saving={String(state.bindingSavingItemId) === String(item.id)}
                            onSave={state.saveBindings}
                          />
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </main>
          <aside className={archiveClass("qa-archive-detail-log")}>
            {state.loading ? (
              <section className={archiveClass("qa-archive-panel qa-archive-detail-log-placeholder")}>
                <div className={archiveClass("qa-archive-panel-title")}>数据日志</div>
                <div className={archiveClass("qa-archive-empty")}>正在加载日志</div>
              </section>
            ) : (
              <VersionHistoryPanel title="数据日志" versions={state.versions} activeVersion={state.historyVersion?.version ?? null} onOpen={state.openVersion} />
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

function ArchiveDocInfo({
  archive,
  readonly,
  onChange,
}: {
  archive: ContractArchiveDetail;
  readonly: boolean;
  onChange: (path: string, value: unknown) => void;
}) {
  const [editingKey, setEditingKey] = useState("");
  const docInfo = archive.docInfo ?? {};
  const keys = [
    ...importantDocInfoKeys,
    ...Object.keys(docInfo).filter((key) => !importantDocInfoKeys.includes(key)),
  ];

  return (
    <section className={archiveClass("qa-archive-panel")}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className={archiveClass("qa-archive-panel-title")}>文档信息</div>
          <div className="text-xs text-slate-500">
            产品编号：{textValue(archive.productNumber)} · 合同编号：{textValue(archive.contractNumber)} · 客户编号：{textValue(archive.customerId)}
          </div>
        </div>
        <JsonBlock title=" 文档信息 JSON" value={docInfo} />
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {keys.map((key) => {
          const field = docInfo[key];
          const hasValueObject = field && typeof field === "object" && "value" in field;
          const value = hasValueObject ? field.value : field;
          const path = hasValueObject ? `docInfo.${key}.value` : `docInfo.${key}`;
          const editing = editingKey === key;
          return (
            <div key={key} className="block">
              <span className="mb-1 block text-xs font-medium text-slate-500">{docInfoLabels[key] ?? key}</span>
              <div className={archiveClass("qa-doc-info-value")}>
                {editing && !readonly ? (
                  <input
                    className={archiveClass("qa-archive-input qa-doc-info-input")}
                    value={textValue(value, "")}
                    onChange={(event) => onChange(path, event.target.value)}
                  />
                ) : (
                  <span className="min-w-0 break-words text-sm leading-5 text-slate-700">{textValue(value)}</span>
                )}
                {!readonly && (
                  <button
                    type="button"
                    className="qa-btn qa-btn-quiet qa-btn-sm !min-h-0 !px-2 !py-0.5"
                    title={editing ? "完成" : "修改"}
                    aria-label={editing ? "完成" : "修改"}
                    onClick={() => setEditingKey(editing ? "" : key)}
                  >
                    {editing ? <CheckSquareOutlined /> : <EditOutlined />}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function HiddenFieldsDisclosure({
  fields,
  dictionaryOptions,
}: {
  fields: Array<ArchiveItemField | QuoteAgentField>;
  dictionaryOptions?: DictionaryOptions;
}) {
  const unmatchedFields = fields.filter(isUnmatchedConfigField);
  const traceFields = fields.filter((field) => !isMainConfigField(field) && !isUnmatchedConfigField(field));
  if (!unmatchedFields.length && !traceFields.length) return null;

  return (
    <div className="space-y-3">
      {unmatchedFields.length > 0 && (
        <div>
          <div className={archiveClass("qa-archive-section-title")}>未匹配字段</div>
          <FieldTable fields={unmatchedFields} dictionaryOptions={dictionaryOptions} mode="hidden" />
        </div>
      )}
      {traceFields.length > 0 && (
        <details className="rounded border border-slate-200 bg-slate-50/60 p-3">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">
            原始字段 / evidence（{traceFields.length}）
          </summary>
          <div className="mt-3">
            <FieldTable fields={traceFields} dictionaryOptions={dictionaryOptions} mode="hidden" />
          </div>
        </details>
      )}
    </div>
  );
}
