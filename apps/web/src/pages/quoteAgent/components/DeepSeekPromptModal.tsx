import { useMemo, useState } from "react";
import type { Candidate, ReviewAction, ReviewDraft, ReviewOperation } from "../types";
import { copyTextToClipboard, extractJsonFromText, readStorageValue, writeStorageValue } from "../utils";

interface PromptCandidate {
  candidate: Candidate;
  candidateType: "term_type" | "value";
  fieldName: string;
  rawValue: string;
}

interface Props {
  open: boolean;
  candidates: PromptCandidate[];
  onClose: () => void;
  onApply: (drafts: ReviewDraft[]) => void;
}

const draftStorageKey = "quoteAgent.manualSuggestionJsonDraft";
const appliedStorageKey = "quoteAgent.manualSuggestionApplied";
const actionMap: Record<string, ReviewAction> = {
  create_term_type: "create_term_type",
  approve_term_type_as_alias: "approve_term_type_as_alias",
  split_term_type: "split_term_type",
  create_value: "create_value",
  approve_value_as_alias: "approve_value_as_alias",
  move_to_other_term_type: "move_value_to_other_term_type",
  move_value_to_other_term_type: "move_value_to_other_term_type",
  split_value: "split_value",
  update_term_type_value_kind: "update_term_type_value_kind",
  reject: "reject",
};

const allowedActionsByCandidateType: Record<PromptCandidate["candidateType"], Set<ReviewAction>> = {
  term_type: new Set(["create_term_type", "approve_term_type_as_alias", "split_term_type", "reject"]),
  value: new Set([
    "create_value",
    "approve_value_as_alias",
    "move_value_to_other_term_type",
    "split_value",
    "update_term_type_value_kind",
    "reject",
  ]),
};

function suggestionsOf(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.suggestions)) return value.suggestions;
  if (Array.isArray(value?.reviews)) return value.reviews;
  if (Array.isArray(value?.items)) return value.items;
  return [];
}

function toDraft(suggestion: any, candidates: PromptCandidate[]): ReviewDraft | null {
  const candidateId = String(suggestion.candidateId || suggestion.id || "");
  const target = candidates.find((item) => String(item.candidate.id) === candidateId);
  if (!target) return null;
  const recommended = String(suggestion.recommendedAction || suggestion.action || "");
  const action = actionMap[recommended];
  if (!action) return null;
  if (!allowedActionsByCandidateType[target.candidateType].has(action)) return null;
  const payload = suggestion.payload || {};
  const base: ReviewOperation = {
    candidateId,
    candidateType: target.candidateType,
    action,
    payload:
      action === "create_term_type"
        ? {
            termType: suggestion.termType || payload.termType || target.candidate.termType || "",
            displayName: suggestion.displayName || payload.displayName || target.fieldName,
            quoteDisplayName: suggestion.quoteDisplayName || payload.quoteDisplayName || target.fieldName,
            category: suggestion.category || payload.category || "",
            valueKind: suggestion.valueKind || payload.valueKind || "text",
            description: suggestion.reason || payload.description || "",
            aliasNames: suggestion.aliasNames || payload.aliasNames || [target.fieldName],
            applicableProductTypes: suggestion.applicableProductTypes || payload.applicableProductTypes || [],
            valueCanonicalValue: suggestion.canonicalValue || payload.valueCanonicalValue || target.rawValue,
            valueDisplayName: suggestion.valueDisplayName || payload.valueDisplayName || target.rawValue,
            valueAliasNames: suggestion.valueAliasNames || payload.valueAliasNames || [target.rawValue],
          }
        : action === "approve_term_type_as_alias"
          ? {
              termType: suggestion.termType || payload.termType || "",
              valueKind: suggestion.valueKind || payload.valueKind || "text",
              aliasNames: suggestion.aliasNames || payload.aliasNames || [target.fieldName],
              appendApplicableProductType: true,
            }
          : action === "split_term_type"
            ? { splits: suggestion.splits || payload.splits || [] }
            : action === "create_value"
            ? {
                canonicalValue: suggestion.canonicalValue || payload.canonicalValue || target.rawValue,
                displayName: suggestion.displayName || payload.displayName || target.rawValue,
                aliasNames: suggestion.aliasNames || payload.aliasNames || [target.rawValue],
                values: suggestion.values || payload.values || [],
              }
            : action === "approve_value_as_alias"
              ? { termId: suggestion.termId || payload.termId || "", aliasNames: suggestion.aliasNames || payload.aliasNames || [target.rawValue] }
              : action === "move_value_to_other_term_type"
                ? { termType: suggestion.termType || payload.termType || "", rawValue: suggestion.rawValue || payload.rawValue || target.rawValue, reason: suggestion.reason || payload.reason || "" }
                : action === "split_value"
                  ? { splits: suggestion.splits || payload.splits || [] }
                  : action === "update_term_type_value_kind"
                    ? { termType: suggestion.termType || payload.termType || target.candidate.termType || "", valueKind: suggestion.valueKind || payload.valueKind || "text" }
                    : { reason: suggestion.reason || payload.reason || "" },
  };
  return { ...base, label: recommended, updatedAt: Date.now() };
}

export function DeepSeekPromptModal({ open, candidates, onClose, onApply }: Props) {
  const [jsonText, setJsonText] = useState(() => readStorageValue(draftStorageKey));
  const [message, setMessage] = useState("");
  const prompt = useMemo(() => {
    const payload = candidates.map((item) => ({
      candidateType: item.candidateType,
      candidateId: String(item.candidate.id),
      rawFieldName: item.candidate.rawFieldName || item.fieldName,
      rawValue: item.candidate.rawValue || item.rawValue,
      termType: item.candidate.termType,
      reason: item.candidate.reason,
      evidence: item.candidate.evidence,
    }));
    return [
      "你是合同/生产明细字段字典审核助手。请只返回 JSON，不要返回解释文字。",
      "对每个候选给出 candidateId、action/recommendedAction、payload。",
      "term_type 候选可用动作：create_term_type、approve_term_type_as_alias、split_term_type、reject；如果原文字段名是复合字段名，请使用 split_term_type，不要使用 split_value。",
      "value 候选可用动作：create_value、approve_value_as_alias、move_value_to_other_term_type、split_value、update_term_type_value_kind、reject。",
      "split_term_type 的 payload.splits 每项格式：{ termType, displayName, valueKind, rawValue, aliasNames, canonicalValue? }。",
      "",
      JSON.stringify({ candidates: payload }, null, 2),
    ].join("\n");
  }, [candidates]);

  if (!open) return null;

  const apply = () => {
    try {
      const parsed = extractJsonFromText(jsonText);
      const drafts = suggestionsOf(parsed).map((item) => toDraft(item, candidates)).filter(Boolean) as ReviewDraft[];
      if (!drafts.length) throw new Error("没有解析到可应用的建议");
      writeStorageValue(draftStorageKey, jsonText);
      writeStorageValue(appliedStorageKey, JSON.stringify(drafts));
      onApply(drafts);
      setMessage(`已应用 ${drafts.length} 条建议`);
    } catch (error) {
      setMessage((error as Error).message);
    }
  };

  const copyPrompt = async () => {
    await copyTextToClipboard(prompt);
    setMessage("Prompt 已复制");
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/30 p-3">
      <div className="mx-auto flex h-full max-w-6xl flex-col border border-slate-300 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">DeepSeek 人工预审</div>
            <div className="text-xs text-slate-500">复制左侧 Prompt，把返回 JSON 粘贴到右侧后应用到字段行草稿。</div>
          </div>
          <button className="qa-btn qa-btn-quiet qa-btn-sm" type="button" onClick={onClose}>关闭</button>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 md:grid-cols-2">
          <section className="flex min-h-0 flex-col">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-semibold text-slate-700">Prompt</div>
              <button className="qa-btn qa-btn-secondary qa-btn-sm" type="button" onClick={copyPrompt}>复制 Prompt</button>
            </div>
            <textarea className="min-h-0 flex-1 resize-none border border-slate-300 bg-slate-50 p-3 font-mono text-xs text-slate-700 outline-none" readOnly value={prompt} />
          </section>
          <section className="flex min-h-0 flex-col">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-semibold text-slate-700">粘贴 JSON</div>
              <button className="qa-btn qa-btn-primary qa-btn-sm" type="button" onClick={apply}>应用建议</button>
            </div>
            <textarea
              className="min-h-0 flex-1 resize-none border border-slate-300 bg-white p-3 font-mono text-xs text-slate-700 outline-none focus:border-blue-500"
              value={jsonText}
              onChange={(event) => {
                setJsonText(event.target.value);
                writeStorageValue(draftStorageKey, event.target.value);
              }}
              placeholder="支持 ```json fenced block，也支持前后带说明文字的宽松 JSON"
            />
          </section>
        </div>
        {message && <div className="border-t border-slate-200 px-4 py-2 text-xs text-blue-700">{message}</div>}
      </div>
    </div>
  );
}
