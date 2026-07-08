import { QuestionCircleOutlined } from "@/components/ui/icons";
import type { ArchiveItemField, DictionaryOptions, QuoteAgentField } from "../../types";
import { archiveClass } from "../classNames";
import { fieldIsModelField, fieldMasterDataMatch, masterDataMatchMethod, masterDataSourceAndId } from "../masterData";
import {
  fieldConfidence,
  fieldDisplayValue,
  fieldDisplayValueDetail,
  fieldDisplayName,
  fieldDisplayNameWithQualifier,
  fieldDictionaryMatched,
  fieldOriginalName,
  fieldStableKey,
  hasMeaningfulRawValue,
  hasEvidence,
  isEnumField,
  isLowConfidence,
  isMainConfigField,
  isSplitDerivedField,
  fieldValueKind,
  roughnessDisplayText,
  textValue,
} from "../../utils";
import { EnumFieldEditor, EnumsFieldEditor, EnumsValueTags } from "./FieldValueEditors";
import { JsonBlock } from "./JsonBlock";

type Props = {
  fields?: Array<ArchiveItemField | QuoteAgentField>;
  basePath?: string;
  dictionaryOptions?: DictionaryOptions;
  dirtyFieldIndexes?: number[];
  editable?: boolean;
  mode?: "mainConfig" | "hidden";
  onChange?: (path: string, value: unknown, meta?: { fieldIndex?: number }) => void;
};

export function FieldTable({
  fields = [],
  basePath = "",
  dictionaryOptions,
  dirtyFieldIndexes = [],
  editable = false,
  mode = "mainConfig",
  onChange,
}: Props) {
  if (!fields.length) return <div className={archiveClass("qa-archive-empty")}>暂无字段</div>;
  const visibleFields = fields
    .map((field, index) => ({ field, index }))
    .filter(({ field }) => (mode === "hidden" ? !isMainConfigField(field) : isMainConfigField(field)));
  if (!visibleFields.length) return <div className={archiveClass("qa-archive-empty")}>暂无可展示字段</div>;
  const updateFieldDictionary = (index: number, dictionaryPatch: Record<string, unknown>) => {
    if (!basePath) return;
    const nextFields = fields.map((field, fieldIndex) => {
      if (fieldIndex !== index) return field;
      return {
        ...field,
        dictionary: {
          ...((field as any).dictionary || {}),
          ...dictionaryPatch,
        },
      };
    });
    onChange?.(basePath, nextFields, { fieldIndex: index });
  };

  return (
    <div className="overflow-auto rounded border border-slate-200">
      <table className="min-w-full table-fixed divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="w-48 px-3 py-2 text-left font-medium text-slate-600">字段</th>
            <th className="w-72 px-3 py-2 text-left font-medium text-slate-600">值</th>
            <th className="w-32 px-3 py-2 text-left font-medium text-slate-600">质量</th>
            <th className="w-44 px-3 py-2 text-left font-medium text-slate-600">依据</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {visibleFields.map(({ field, index }) => {
            const confidence = fieldConfidence(field);
            const evidence = (field as any).evidence;
            const missingEvidence = !hasEvidence(evidence);
            const splitDerived = isSplitDerivedField(field);
            const shouldWarnMissingEvidence = missingEvidence && !splitDerived;
            const matched = fieldDictionaryMatched(field);
            const baseDisplayName = fieldDisplayName(field, dictionaryOptions);
            const displayName = fieldDisplayNameWithQualifier(field, dictionaryOptions);
            const originalName = fieldOriginalName(field);
            const showOriginalHint = baseDisplayName !== originalName;
            const valueDetail = fieldDisplayValueDetail(field);
            const hasRawValue = hasMeaningfulRawValue(field);
            const showUnmatchedWarning = !matched && hasRawValue;
            const warnRow = (isLowConfidence(field) && hasRawValue) || shouldWarnMissingEvidence;
            const dirty = dirtyFieldIndexes.includes(index);
            const roughnessText = roughnessDisplayText(field);
            return (
              <tr key={fieldStableKey(field, basePath || "archive", index)} className={warnRow ? "bg-amber-50/45" : undefined}>
                <td className="px-3 py-2 align-top text-slate-800">
                  <span className="inline-flex max-w-full items-center gap-1">
                    <span className="truncate">{displayName}</span>
                    {showOriginalHint && (
                      <span className="group relative inline-flex shrink-0">
                        <QuestionCircleOutlined className="text-xs text-slate-400" />
                        <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 hidden -translate-x-1/2 whitespace-nowrap rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 shadow group-hover:block">
                          原值：{originalName}
                        </span>
                      </span>
                    )}
                    {dirty && (
                      <span className="shrink-0 rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[11px] leading-none text-blue-700">
                        未保存
                      </span>
                    )}
                  </span>
                  <FieldMasterDataMeta field={field} />
                </td>
                <td className="px-3 py-2 align-top">
                  {editable && mode === "mainConfig" && fieldValueKind(field, dictionaryOptions) === "enums" ? (
                    <EnumsFieldEditor
                      field={field}
                      dictionaryOptions={dictionaryOptions}
                      onChange={(value) => {
                        updateFieldDictionary(index, {
                          values: value.values,
                          display_name: value.displayName,
                          matched: value.matched,
                          field_matched: true,
                        });
                      }}
                    />
                  ) : editable && mode === "mainConfig" && isEnumField(field, dictionaryOptions) ? (
                    <EnumFieldEditor
                      field={field}
                      dictionaryOptions={dictionaryOptions}
                      onChange={(value) => {
                        updateFieldDictionary(index, {
                          display_name: value.displayName,
                          canonical_value: value.canonicalValue || value.displayName,
                          matched: value.matched,
                          field_matched: true,
                        });
                      }}
                    />
                  ) : editable && mode === "mainConfig" ? (
                    <input
                      className={archiveClass("qa-archive-input")}
                      value={textValue(fieldDisplayValue(field), "")}
                      onChange={(event) => updateFieldDictionary(index, { display_name: event.target.value })}
                    />
                  ) : fieldValueKind(field, dictionaryOptions) === "enums" ? (
                    <EnumsValueTags field={field} dictionaryOptions={dictionaryOptions} />
                  ) : valueDetail.showRawAndStandard ? (
                    <div className="space-y-1">
                      <div>
                        <span className="text-xs text-slate-500">原始：</span>
                        {valueDetail.rawValue}
                      </div>
                      <div>
                        <span className="text-xs text-slate-500">标准：</span>
                        {valueDetail.standardValue}
                      </div>
                    </div>
                  ) : (
                    textValue(valueDetail.displayValue)
                  )}
                  {roughnessText && <div className="mt-1 text-xs text-slate-500">{roughnessText}</div>}
                  {showUnmatchedWarning && <div className="mt-1 text-xs text-amber-700">未匹配，显示原始值</div>}
                </td>
                <td className="px-3 py-2 align-top">
                  <div className="space-y-1">
                    <span className={isLowConfidence(field) && hasRawValue ? archiveClass("qa-archive-badge-warn") : archiveClass("qa-archive-badge")}>
                      {confidence ?? "-"}
                    </span>
                    {shouldWarnMissingEvidence && <span className={archiveClass("qa-archive-badge-warn")}>缺依据</span>}
                  </div>
                </td>
                <td className="px-3 py-2 align-top">
                  {missingEvidence ? (
                    splitDerived ? (
                      <span className="text-xs text-slate-500">由原始复合字段拆分生成，未单独提供依据</span>
                    ) : (
                      <span className="text-xs text-amber-700">未提供</span>
                    )
                  ) : (
                    <JsonBlock title=" 依据" value={evidence} />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FieldMasterDataMeta({ field }: { field: ArchiveItemField | QuoteAgentField }) {
  const match = fieldMasterDataMatch(field);
  if (!match || !fieldIsModelField(field)) return null;
  const matchMethod = masterDataMatchMethod(match);
  const sourceAndId = masterDataSourceAndId(match);
  if (!matchMethod && !sourceAndId) return null;

  return (
    <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] leading-5">
      {matchMethod && (
        <span className="rounded border border-blue-100 bg-blue-50 px-1.5 text-blue-700">
          {matchMethod}
        </span>
      )}
      {sourceAndId && (
        <span className="rounded border border-slate-200 bg-slate-50 px-1.5 text-slate-500">
          {sourceAndId}
        </span>
      )}
    </div>
  );
}
