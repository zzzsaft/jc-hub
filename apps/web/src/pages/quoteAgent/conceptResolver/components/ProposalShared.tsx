import type { ReactNode } from "react";
import { cr } from "../classNames";
import {
  json,
  textValue,
} from "../utils";

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={cr("cr-proposal-panel")}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

export function Mini({ label, value }: { label: string; value: unknown }) {
  return (
    <div className={cr("cr-proposal-mini")}>
      <span>{label}</span>
      <strong title={textValue(value)}>{textValue(value)}</strong>
    </div>
  );
}

export function Info({ label, value }: { label: string; value: unknown }) {
  return (
    <div className={cr("cr-info-row")}>
      <span>{label}</span>
      <strong>{textValue(value)}</strong>
    </div>
  );
}

export function JsonDetails({ title, value }: { title: string; value: unknown }) {
  return (
    <details className={cr("cr-inline-details")}>
      <summary>{title}</summary>
      <pre>{json(value)}</pre>
    </details>
  );
}
