import { useState } from "react";
import { CandidateClusterDeepSeekPromptModal } from "./components/CandidateClusterDeepSeekPromptModal";
import { CandidateClusterDictionaryModal } from "./components/CandidateClusterDictionaryModal";
import { CandidateClusterManualReviewPanel } from "./components/CandidateClusterManualReviewPanel";
import { CandidateClusterPageHeader } from "./components/CandidateClusterPageHeader";
import { CandidateClusterReviewContent } from "./components/CandidateClusterReviewContent";
import { CandidateClusterToast } from "./components/CandidateClusterToast";
import { useCandidateClusterReviewState } from "./hooks/useCandidateClusterReviewState";
import type { CandidateCluster } from "./types";
import "./styles.css";

const reviewPromptText = (value: unknown) => {
  if (typeof value === "string") return value;
  const prompt = value as any;
  return String(prompt?.prompt ?? prompt?.promptTemplate ?? prompt?.content ?? prompt?.systemPrompt ?? "");
};

const numericSummaryValue = (value: unknown, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

export default function CandidateClusterReviewPage() {
  const state = useCandidateClusterReviewState();
  const [activeTab, setActiveTab] = useState<"clusters" | "units">("clusters");
  const [deepSeekOpen, setDeepSeekOpen] = useState(false);
  const [dictionaryOpen, setDictionaryOpen] = useState(false);
  const [manualCluster, setManualCluster] = useState<CandidateCluster | null>(null);
  const promptText = reviewPromptText(state.reviewPrompt);
  const toast = state.loading
    ? { type: "loading" as const, text: "正在刷新候选簇..." }
    : state.suggesting
      ? { type: "loading" as const, text: "正在按候选簇生成 AI 建议，不按文档逐条生成..." }
      : state.renormalizing
        ? { type: "loading" as const, text: "正在重跑 extraction normalization..." }
        : state.submitting
          ? { type: "loading" as const, text: "正在提交已勾选建议..." }
          : state.error
            ? { type: "error" as const, text: `操作失败：${state.error}` }
            : state.message
              ? { type: state.message.includes("未匹配") ? "error" as const : "success" as const, text: state.message }
              : null;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      {toast && <CandidateClusterToast type={toast.type} text={toast.text} />}
      <main className="p-3 sm:p-5">
        <div className="mx-auto max-w-[1600px] border border-slate-200 bg-white shadow-sm">
          <CandidateClusterPageHeader promptText={promptText} onOpenDictionary={() => setDictionaryOpen(true)} />
          <CandidateClusterReviewContent
            activeTab={activeTab}
            state={state}
            numericSummaryValue={numericSummaryValue}
            onActiveTabChange={setActiveTab}
            onOpenManualPrompt={() => setDeepSeekOpen(true)}
            onOpenManualReview={setManualCluster}
          />
        </div>
      </main>
      <CandidateClusterDictionaryModal
        open={dictionaryOpen}
        onOpen={() => setDictionaryOpen(true)}
        onClose={() => setDictionaryOpen(false)}
      />
      <CandidateClusterDeepSeekPromptModal
        open={deepSeekOpen}
        clusters={state.visibleClusters}
        reviewPrompt={state.reviewPrompt}
        promptData={state.promptData}
        onClose={() => setDeepSeekOpen(false)}
        onApply={state.applyManualSuggestions}
      />
      <CandidateClusterManualReviewPanel
        cluster={manualCluster}
        options={state.options}
        onClose={() => setManualCluster(null)}
        onSave={(cluster, operation) => {
          state.saveManualOperation(cluster, operation);
          setManualCluster(null);
        }}
        onSubmit={async (cluster, operation) => {
          await state.submitManualOperation(cluster, operation);
          setManualCluster(null);
        }}
      />
    </div>
  );
}
