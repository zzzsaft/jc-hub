import { useMemo, useRef, useState } from "react";
import type { CandidateCluster, CandidateClusterPromptData, CandidateClusterReviewPromptResponse } from "../types";
import { copyTextToClipboard, extractJsonFromText, readStorageValue, writeStorageValue } from "../utils";

interface Props {
  open: boolean;
  clusters: CandidateCluster[];
  reviewPrompt: CandidateClusterReviewPromptResponse | string;
  promptData: CandidateClusterPromptData;
  onClose: () => void;
  onApply: (suggestions: unknown) => number;
}

const storageKey = "quoteAgent.clusterManualSuggestionJsonDraft";

const stringify = (value: unknown) => JSON.stringify(value ?? null, null, 2);

function templateTextOf(reviewPrompt: CandidateClusterReviewPromptResponse | string) {
  if (typeof reviewPrompt === "string") return reviewPrompt;
  return String(reviewPrompt.prompt ?? reviewPrompt.promptTemplate ?? reviewPrompt.content ?? reviewPrompt.systemPrompt ?? "");
}

function replacePromptPlaceholders(template: string, values: Record<string, unknown>) {
  return Object.entries(values).reduce(
    (text, [key, value]) => text
      .replace(new RegExp(`"{{\\s*${key}\\s*}}"`, "g"), stringify(value))
      .replace(new RegExp(`{{\\s*${key}\\s*}}`, "g"), stringify(value)),
    template,
  );
}

export function CandidateClusterDeepSeekPromptModal({ open, clusters, reviewPrompt, promptData, onClose, onApply }: Props) {
  const [jsonText, setJsonText] = useState(() => readStorageValue(storageKey));
  const [message, setMessage] = useState("");
  const promptRef = useRef<HTMLTextAreaElement | null>(null);

  const prompt = useMemo(() => {
    const candidateClusters = clusters.map((cluster) => ({
      clusterId: cluster.clusterId ?? cluster.id,
      candidateType: cluster.candidateType,
      candidateIds: cluster.candidateIds,
      termType: cluster.termType,
      normalizedFieldName: cluster.normalizedFieldName,
      normalizedRawValue: cluster.normalizedRawValue,
      rawFieldNameSamples: cluster.rawFieldNameSamples,
      rawValueSamples: cluster.rawValueSamples,
      sourceProductType: cluster.sourceProductType,
      reason: cluster.reason,
      occurrenceCount: cluster.occurrenceCount,
      documentCount: cluster.documentCount,
      commonContexts: cluster.commonContexts,
      sampleOccurrences: cluster.sampleOccurrences,
    }));
    const template = templateTextOf(reviewPrompt);
    if (template) {
      return replacePromptPlaceholders(template, {
        productTypes: promptData.productTypes,
        termTypes: promptData.termTypes,
        enumValues: promptData.enumValues,
        candidateClusters,
        priorDecisions: promptData.priorDecisions,
      });
    }

    return [
      "你是 quoteAgent 字典候选簇级批量治理助手。只输出合法 JSON，不要 Markdown，不要解释文字。",
      "",
      "请只针对下面 candidateClusters 输出簇级审核建议。",
      "返回格式：",
      JSON.stringify({
        suggestions: [
          {
            clusterId: "cluster id",
            recommendedAction: "create_term_type | approve_term_type_as_alias | split_term_type | create_value | approve_value_as_alias | move_value_to_other_term_type | split_value | update_term_type_value_kind | reject",
            confidence: 0.9,
            riskLevel: "low | medium | high",
            needsHumanReview: false,
            humanReviewSummary: "给人工审核员看的简短结论",
            reason: "建议原因",
            batchOperationsPreview: [
              {
                candidateType: "term_type | value",
                candidateId: "candidate id",
                action: "review action",
                payload: {},
              },
            ],
          },
        ],
      }, null, 2),
      "term_type 候选如果是复合字段名，请建议 split_term_type，不能建议 split_value。split_term_type 的 payload.splits 每项格式：{ termType, displayName, valueKind, rawValue, aliasNames, canonicalValue? }。",
      "value 候选仍可使用 split_value 拆分原始值。",
      "",
      "candidateClusters:",
      stringify(candidateClusters),
    ].join("\n");
  }, [clusters, promptData, reviewPrompt]);

  if (!open) return null;

  const copyPrompt = async () => {
    const copied = await copyTextToClipboard(prompt);
    if (!copied) {
      promptRef.current?.focus();
      promptRef.current?.select();
    }
    setMessage(copied ? "Prompt 已复制" : "复制失败，已帮你选中左侧 Prompt，请按 Ctrl+C");
  };

  const apply = () => {
    try {
      const parsed = extractJsonFromText(jsonText);
      const appliedCount = onApply(parsed);
      writeStorageValue(storageKey, jsonText);
      if (appliedCount > 0) {
        setMessage(`已应用到 ${appliedCount} 个候选簇`);
        onClose();
      } else {
        setMessage("没有匹配到当前页面候选簇，请检查 JSON 中的 clusterId / clusterKey / candidateIds");
      }
    } catch (error) {
      setMessage((error as Error).message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/30 p-3">
      <div className="mx-auto flex h-full max-w-6xl flex-col border border-slate-300 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">候选簇 DeepSeek Prompt</div>
            <div className="text-xs text-slate-500">复制左侧 Prompt 到 DeepSeek，把返回 JSON 粘贴到右侧后应用。</div>
          </div>
          <button className="qa-btn qa-btn-quiet qa-btn-sm" type="button" onClick={onClose}>关闭</button>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 md:grid-cols-2">
          <section className="flex min-h-0 flex-col">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-semibold text-slate-700">Prompt（当前 {clusters.length} 个候选簇）</div>
              <button className="qa-btn qa-btn-secondary qa-btn-sm" type="button" onClick={copyPrompt}>复制 Prompt</button>
            </div>
            <textarea ref={promptRef} className="min-h-0 flex-1 resize-none border border-slate-300 bg-slate-50 p-3 font-mono text-xs text-slate-700 outline-none" readOnly value={prompt} />
          </section>
          <section className="flex min-h-0 flex-col">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-semibold text-slate-700">粘贴 DeepSeek JSON</div>
              <button className="qa-btn qa-btn-primary qa-btn-sm" type="button" onClick={apply}>应用建议</button>
            </div>
            <textarea
              className="min-h-0 flex-1 resize-none border border-slate-300 bg-white p-3 font-mono text-xs text-slate-700 outline-none focus:border-blue-500"
              value={jsonText}
              onChange={(event) => {
                setJsonText(event.target.value);
                writeStorageValue(storageKey, event.target.value);
              }}
              placeholder="支持 { suggestions: [...] }，也支持 DeepSeek 返回的 ```json 代码块"
            />
          </section>
        </div>
        {message && <div className="border-t border-slate-200 px-4 py-2 text-xs text-blue-700">{message}</div>}
      </div>
    </div>
  );
}
