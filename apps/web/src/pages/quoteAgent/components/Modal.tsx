import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  footer?: ReactNode;
  open: boolean;
  subtitle?: ReactNode;
  title: ReactNode;
  widthClassName?: string;
  onClose: () => void;
}

export function Modal({
  children,
  footer,
  open,
  subtitle,
  title,
  widthClassName = "max-w-lg",
  onClose,
}: Props) {
  if (!open) return null;

  return (
    <div
      className="qa-modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-3"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        aria-modal="true"
        className={`qa-modal-panel w-full border border-slate-300 bg-white shadow-xl ${widthClassName}`}
        role="dialog"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">{title}</div>
            {subtitle && <div className="mt-1 text-xs text-slate-500">{subtitle}</div>}
          </div>
          <button className="qa-btn qa-btn-quiet qa-btn-sm" type="button" onClick={onClose}>
            关闭
          </button>
        </div>

        <div className="p-4">{children}</div>

        {footer && (
          <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
