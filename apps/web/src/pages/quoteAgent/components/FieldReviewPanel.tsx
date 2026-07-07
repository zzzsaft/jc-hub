import { useEffect, useMemo, useState } from "react";
import { FieldReviewActionForms } from "./FieldReviewActionForms";
import type {
  Candidate,
  CandidateType,
  DictionaryOptions,
  DictionaryTermType,
  QuoteAgentField,
  ReviewAction,
  ReviewDraft,
  ReviewOperation,
} from "../types";
import {
  initialState,
  normalize,
  payloadFor,
  rawValueOf,
  termActions,
  valueActions,
  valueKeyOf,
  withFieldQualifier,
} from "./fieldReviewPanel.utils";
import type { FormState } from "./fieldReviewPanel.utils";

interface Props {
  field: QuoteAgentField;
  candidate: Candidate;
  candidateType: CandidateType;
  options: DictionaryOptions;
  draft?: ReviewDraft;
  onSaveDraft: (draft: ReviewDraft) => void;
  onSubmit: (operation: ReviewOperation) => Promise<void>;
  onClose: () => void;
}

export function FieldReviewPanel({ field, candidate, candidateType, options, draft, onSaveDraft, onSubmit, onClose }: Props) {
  const actions = candidateType === "term_type" ? termActions : valueActions;
  const [action, setAction] = useState<ReviewAction | "">(draft?.action || "");
  const [state, setState] = useState<FormState>(() => initialState(candidate, field, candidateType, draft));
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setAction(draft?.action || "");
    setState(initialState(candidate, field, candidateType, draft));
  }, [candidate, candidateType, draft, field]);

  const selectedTermType = useMemo(
    () => options.termTypes.find((item) => item.termType === state.termType),
    [options.termTypes, state.termType],
  );
  const values = useMemo(
    () => options.values.filter((item) => !state.termType || item.termType === state.termType),
    [options.values, state.termType],
  );
  const selectedEnumLabels = values
    .map((item) => item.displayName || item.canonicalValue)
    .filter((item): item is string => Boolean(item));
  const rawValue = rawValueOf(candidate, field);
  const rawValueAlreadyExists = values.some((item) => {
    const aliases = [...(item.aliasNames || []), ...(item.aliases || [])];
    return [item.canonicalValue, item.displayName, ...aliases].some((value) => normalize(value) === normalize(rawValue));
  });
  const targetIsEnum = state.valueKind === "enum" || state.valueKind === "enums";
  const categoryOptions = useMemo(
    () => Array.from(new Set(options.termTypes.map((item) => item.category).filter(Boolean))).sort() as string[],
    [options.termTypes],
  );

  const update = (key: string, value: unknown) => setState((current) => ({ ...current, [key]: value }));
  const chooseExistingValue = (valueId: string) => {
    const selectedValue = values.find((item) => valueKeyOf(item) === valueId);
    setState((current) => ({
      ...current,
      termId: valueId,
      aliasNamesText: current.aliasNamesText || rawValue,
      canonicalValue: selectedValue?.canonicalValue || current.canonicalValue,
      displayName: selectedValue?.displayName || current.displayName,
    }));
  };
  const chooseTermType = (termType: string, term?: DictionaryTermType) => {
    const nextValues = options.values.filter((item) => item.termType === termType);
    const nextRawValueAlreadyExists = nextValues.some((item) => {
      const aliases = [...(item.aliasNames || []), ...(item.aliases || [])];
      return [item.canonicalValue, item.displayName, ...aliases].some((value) => normalize(value) === normalize(rawValue));
    });
    setState((current) => ({
      ...current,
      termType,
      valueKind: term?.valueKind || current.valueKind,
      displayName: term?.displayName || current.displayName,
      quoteDisplayName: term?.quoteDisplayName || current.quoteDisplayName,
      category: term?.category || current.category,
      sortOrder: term?.sortOrder ?? current.sortOrder,
      applicableProductTypes: term?.applicableProductTypes || current.applicableProductTypes,
      addEnumValue: term?.valueKind === "enum" || term?.valueKind === "enums" ? !nextRawValueAlreadyExists : false,
    }));
  };
  const effectiveAction = (): ReviewAction => (
    action === "approve_term_type_as_alias" && state.editTermTypeSettings === true
      ? "create_term_type"
      : action as ReviewAction
  );
  const operation = (): ReviewOperation => ({
    candidateType,
    candidateId: String(candidate.id),
    action: effectiveAction(),
    payload: withFieldQualifier(payloadFor(effectiveAction(), state), field),
  });
  const save = () => {
    onSaveDraft({ ...operation(), label: actions.find((item) => item.value === action)?.label || action, updatedAt: Date.now() });
    onClose();
  };
  const submit = async () => {
    if (!action) return;
    setSubmitting(true);
    try {
      await onSubmit(operation());
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-300 bg-white shadow-2xl md:absolute md:inset-auto md:right-4 md:top-10 md:w-[min(520px,calc(100vw-2rem))] md:border">
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900">{candidateType === "term_type" ? "字段 Key 审核" : "字段值审核"}</div>
          <div className="mt-1 truncate text-xs text-slate-500">
            #{candidate.id} · {field.field_name || candidate.rawFieldName || "未命名字段"}
          </div>
        </div>
        <button className="qa-btn qa-btn-quiet qa-btn-sm" type="button" onClick={onClose}>关闭</button>
      </div>

      <div className="max-h-[70vh] overflow-y-auto px-4 py-3">
        <div className="mb-3 grid grid-cols-1 gap-2 text-xs text-slate-600 xl:grid-cols-2">
          <div className="border border-slate-200 bg-slate-50 p-2">
            <div className="text-[11px] text-slate-400">原文字段</div>
            <div className="mt-1 break-words text-slate-800">{field.field_name || candidate.rawFieldName || "-"}</div>
          </div>
          <div className="border border-slate-200 bg-slate-50 p-2">
            <div className="text-[11px] text-slate-400">原始值</div>
            <div className="mt-1 break-words text-slate-800">{rawValue || "-"}</div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {actions.map((item) => (
            <button
              key={item.value}
              type="button"
              className={`qa-action-tab ${action === item.value ? "qa-action-tab-active" : ""}`}
              onClick={() => setAction(item.value)}
            >
              <span className="block text-xs font-semibold">{item.label}</span>
              <span className="mt-0.5 block text-[11px] font-normal text-slate-500">{item.hint}</span>
            </button>
          ))}
        </div>

        <div className="mt-3 min-h-[360px] border border-slate-200 bg-white p-3">
          <FieldReviewActionForms
            action={action}
            state={state}
            options={options}
            selectedTermType={selectedTermType}
            values={values}
            selectedEnumLabels={selectedEnumLabels}
            rawValue={rawValue}
            rawValueAlreadyExists={rawValueAlreadyExists}
            targetIsEnum={targetIsEnum}
            categoryOptions={categoryOptions}
            update={update}
            chooseTermType={chooseTermType}
            chooseExistingValue={chooseExistingValue}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-3">
        <div className="text-xs text-slate-500">保存草稿后，可在底部批量提交。</div>
        <div className="flex gap-2">
          <button className="qa-btn qa-btn-secondary qa-btn-sm" type="button" onClick={save} disabled={!action}>保存草稿</button>
          <button className="qa-btn qa-btn-primary qa-btn-sm" type="button" onClick={submit} disabled={!action || submitting}>
            {submitting ? "提交中" : "立即提交"}
          </button>
        </div>
      </div>
    </div>
  );
}
