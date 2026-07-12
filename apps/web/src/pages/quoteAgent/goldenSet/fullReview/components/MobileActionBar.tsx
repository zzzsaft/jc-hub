import type { SaveState } from "../types";

export function MobileActionBar({ saveState, onSkip, onSubmit }: { saveState: SaveState; onSkip(): void; onSubmit(): void }) {
  const status = saveState === "saving" ? "正在保存" : saveState === "saved" ? "已保存" : saveState === "failed" ? "保存失败" : "尚未保存";
  return <footer className="full-review-actions" aria-label="标注操作"><span aria-live="polite">{status}</span><div><button type="button" onClick={onSkip}>稍后处理</button><button type="button" className="full-review-primary" onClick={onSubmit}>保存并下一条</button></div></footer>;
}
