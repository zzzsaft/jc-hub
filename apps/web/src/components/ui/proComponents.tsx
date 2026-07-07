import React from "react";
import { Card } from "./core";
export { default as TailForm, TailFormList, TailFormGroup, TailFormText, TailFormDependency } from "./proForm";
export type { TailFormListProps } from "./types";

export const TailCard = ({ title, children, className, ...props }: any) => (
  <Card title={title} className={className} {...props}>
    {children}
  </Card>
);
