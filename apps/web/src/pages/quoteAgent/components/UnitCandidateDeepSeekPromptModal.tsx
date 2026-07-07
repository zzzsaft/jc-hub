import { useMemo, useRef, useState } from "react";
import type { UnitAlias, UnitCandidate, UnitCandidateReviewPromptResponse } from "../types";
import { copyTextToClipboard, extractJsonFromText, json, readStorageValue, writeStorageValue } from "../utils";
import { unitAliasesForPrompt, unitCandidatesForPrompt } from "../unitCandidateReview.utils";

type Props = {
  open: boolean;
  aliases: UnitAlias[];
  candidates: UnitCandidate[];
  reviewPrompt: UnitCandidateReviewPromptResponse | string;
  onClose: () => void;
  onApply: (suggestions: unknown) => number;
};

const storageKey = "quoteAgent.unitCandidateManualSuggestionJsonDraft";

function stringify(value: unknown) {
  return JSON.stringify(value ?? null, null, 2);
}

function templateTextOf(reviewPrompt: UnitCandidateReviewPromptResponse | string) {
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

export function UnitCandidateDeepSeekPromptModal({ open, aliases, candidates, reviewPrompt, onClose, onApply }: Props) {
  const [jsonText, setJsonText] = useState(() => readStorageValue(storageKey));
  const [message, setMessage] = useState("");
  const promptRef = useRef<HTMLTextAreaElement | null>(null);

  const prompt = useMemo(() => {
    const unitAliases = unitAliasesForPrompt(aliases);
    const unitCandidates = unitCandidatesForPrompt(candidates);
    const template = templateTextOf(reviewPrompt);
    if (template) {
      return replacePromptPlaceholders(template, { unitAliases, unitCandidates });
    }

    return [
      "你是 productConfigAgent 单位 Alias 审核助手。只输出合法 JSON，不要 Markdown，不要解释文字。",
      "不要做单位换算，不要重排区间顺序；只判断 rawUnit 是否是同一单位的拼写/格式 alias。",
      "返回格式：",
      json({
        suggestions: [
          {
            candidateId: "candidate id",
            recommendedAction: "approve | reject | needs_human_review",
            canonicalUnit: "kg/h",
            displayUnit: "kg/h",
            aliasValue: "公斤/H",
            confidence: 0.9,
            riskLevel: "low | medium | high",
            needsHumanReview: false,
            reason: "建议原因",
          },
        ],
      }),
      "",
      "unitAliases:",
      stringify(unitAliases),
      "",
      "unitCandidates:",
      stringify(unitCandidates),
    ].join("\n");
  }, [aliases, candidates, reviewPrompt]);

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
        setMessage(`已应用到 ${appliedCount} 个单位候选`);
        onClose();
      } else {
        setMessage("没有匹配到当前页面单位候选，请检查 JSON 中的 candidateId");
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
            <div className="text-sm font-semibold text-slate-900">单位 Alias DeepSeek Prompt</div>
            <div className="text-xs text-slate-500">复制左侧 Prompt 到 DeepSeek，把返回 JSON 粘贴到右侧后应用。</div>
          </div>
          <button className="qa-btn qa-btn-quiet qa-btn-sm" type="button" onClick={onClose}>关闭</button>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 md:grid-cols-2">
          <section className="flex min-h-0 flex-col">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-semibold text-slate-700">Prompt（当前 {candidates.length} 个单位候选）</div>
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
