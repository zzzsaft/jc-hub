import { DeepSeekPromptModal } from "./components/DeepSeekPromptModal";
import { QuoteAgentBatchBar } from "./components/QuoteAgentBatchBar";
import { QuoteAgentReviewPanel } from "./components/QuoteAgentReviewPanel";
import { QuoteAgentTaskPanel } from "./components/QuoteAgentTaskPanel";
import { QuoteAgentToolbar } from "./components/QuoteAgentToolbar";
import { useQuoteAgentPageState } from "./hooks/useQuoteAgentPageState";
import "./styles.css";

export default function QuoteAgentPage() {
  const state = useQuoteAgentPageState();

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <main className="p-3 sm:p-5">
        <div className="mx-auto max-w-[1600px] border border-slate-200 bg-white shadow-sm">
          <QuoteAgentToolbar {...state} />

          <div className="grid grid-cols-1 gap-0 lg:grid-cols-[320px_minmax(0,1fr)]">
            <QuoteAgentTaskPanel {...state} />
            <QuoteAgentReviewPanel {...state} />
          </div>

          <QuoteAgentBatchBar {...state} />
        </div>
      </main>

      <DeepSeekPromptModal
        open={state.deepSeekOpen}
        candidates={state.promptCandidates}
        onClose={() => state.setDeepSeekOpen(false)}
        onApply={state.applyDeepSeekDrafts}
      />
    </div>
  );
}
