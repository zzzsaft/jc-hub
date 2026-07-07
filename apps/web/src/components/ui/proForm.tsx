import React from "react";
import { Form, Space } from "./core";

const TailFormRoot = Object.assign(
  ({ children, submitter, ...props }: any) => (
    <Form {...props}>
      {children}
      {submitter}
    </Form>
  ),
  {
    Item: Form.Item,
    List: Form.List,
    Group: ({ children }: any) => <div className="grid gap-3 md:grid-cols-2">{children}</div>,
  },
);

export const TailFormList = ({ children, name }: any) => (
  <Form.List name={name}>
    {(fields: any[], operations: any) => (
      <div className="space-y-3">
        {fields.map((field) => (
          <div key={field.key}>{typeof children === "function" ? children(field, field.name, operations) : children}</div>
        ))}
      </div>
    )}
  </Form.List>
);

export const TailFormGroup = ({ children }: any) => <Space direction="vertical" className="w-full">{children}</Space>;

export function TailFormDependency<T = any>({ children }: any) {
  return <>{typeof children === "function" ? children({} as T) : children}</>;
}

export const TailFormText = (props: any) => <Form.Item {...props} />;

export default TailFormRoot;
export type { ProFromListCommonProps, TailFormListProps } from "./types";
