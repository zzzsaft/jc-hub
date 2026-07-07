import { useState } from "react";
import { json } from "../../utils";

type Props = {
  title?: string;
  value: unknown;
  defaultOpen?: boolean;
};

export function JsonBlock({ title = "详情", value, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="qa-archive-json">
      <button type="button" className="qa-archive-link" onClick={() => setOpen((current) => !current)}>
        {open ? "收起" : "展开"}{title}
      </button>
      {open && <pre className="qa-archive-pre">{json(value)}</pre>}
    </div>
  );
}
