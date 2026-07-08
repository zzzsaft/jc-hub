import { useState } from "react";
import { json } from "../../utils";
import { archiveClass } from "../classNames";

type Props = {
  title?: string;
  value: unknown;
  defaultOpen?: boolean;
};

export function JsonBlock({ title = "详情", value, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={archiveClass("qa-archive-json")}>
      <button type="button" className={archiveClass("qa-archive-link")} onClick={() => setOpen((current) => !current)}>
        {open ? "收起" : "展开"}{title}
      </button>
      {open && <pre className={archiveClass("qa-archive-pre")}>{json(value)}</pre>}
    </div>
  );
}
