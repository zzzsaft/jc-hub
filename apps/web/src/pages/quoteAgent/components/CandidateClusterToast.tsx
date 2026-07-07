import { useEffect, useState } from "react";

type ToastType = "loading" | "success" | "error" | "info";

interface Props {
  type: ToastType;
  text: string;
}

const toneClass: Record<ToastType, string> = {
  loading: "border-amber-200 bg-amber-50 text-amber-800",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  error: "border-rose-200 bg-rose-50 text-rose-700",
  info: "border-blue-200 bg-blue-50 text-blue-700",
};

export function CandidateClusterToast({ type, text }: Props) {
  const [visible, setVisible] = useState(Boolean(text));

  useEffect(() => {
    setVisible(Boolean(text));
    if (!text || type === "loading") return undefined;
    const timer = window.setTimeout(() => setVisible(false), type === "error" ? 5000 : 2600);
    return () => window.clearTimeout(timer);
  }, [text, type]);

  if (!visible || !text) return null;

  return (
    <div className="pointer-events-none fixed left-1/2 top-5 z-[1200] w-[min(92vw,560px)] -translate-x-1/2">
      <div className={`mx-auto flex items-start gap-2 rounded-md border px-4 py-3 text-sm shadow-lg ${toneClass[type]}`}>
        {type === "loading" && <span className="mt-0.5 h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-amber-200 border-t-amber-600" />}
        {type === "success" && <span className="shrink-0 font-semibold">✓</span>}
        {type === "error" && <span className="shrink-0 font-semibold">!</span>}
        {type === "info" && <span className="shrink-0 font-semibold">i</span>}
        <span className="min-w-0 break-words">{text}</span>
      </div>
    </div>
  );
}
