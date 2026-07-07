import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Button, Input, Modal, Select } from "@/components/ui/core";
import type { DictionaryTermType, ProductTypeOption } from "../../quoteAgent/types";
import type { DictionaryEditorState } from "../types";
import { AliasTagInput } from "./AliasTagInput";
import { ProductScopeMultiSelect } from "./ProductScopeMultiSelect";

type Props = {
  editor: DictionaryEditorState;
  saving: boolean;
  termTypes: DictionaryTermType[];
  productTypes: ProductTypeOption[];
  onChange: (values: Record<string, string>) => void;
  onSubmit: () => void;
  onClose: () => void;
};

const defaultValueKinds = ["text", "enum", "enums", "number", "number_unit", "boolean"];

const splitList = (value: string) =>
  value
    .split(/[\n,，、]/)
    .map((item) => item.trim())
    .filter(Boolean);

const joinList = (values: string[]) => values.join("\n");

const productTypeValue = (item: ProductTypeOption) =>
  String(item.canonicalValue ?? item.value ?? item.displayName ?? item.label ?? "").trim();

const productTypeLabel = (item: ProductTypeOption) =>
  String(item.displayName ?? item.label ?? item.canonicalValue ?? item.value ?? "").trim();

const fieldClass = "min-w-0 space-y-1.5";
const fieldLabelClass = "block text-sm font-medium text-slate-700";

function RequiredLabel({ children }: { children: string }) {
  return (
    <span className={fieldLabelClass}>
      {children}
      <span className="ml-1 text-red-500">*</span>
    </span>
  );
}

export function DictionaryEditorModal({
  editor,
  saving,
  termTypes,
  productTypes,
  onChange,
  onSubmit,
  onClose,
}: Props) {
  const [submitted, setSubmitted] = useState(false);
  const valueKindOptions = useMemo(
    () =>
      Array.from(
        new Set([
          ...defaultValueKinds,
          ...termTypes.map((item) => String(item.valueKind ?? "").trim()).filter(Boolean),
        ]),
      ).map((value) => ({ value, label: value })),
    [termTypes],
  );

  const productTypeOptions = useMemo(
    () =>
      productTypes
        .map((item) => ({
          value: productTypeValue(item),
          label: productTypeLabel(item),
        }))
        .filter((item) => item.value),
    [productTypes],
  );

  if (!editor) return null;

  const isTermType = editor.kind === "termType";
  const values = editor.values as Record<string, string>;
  const currentTermType = termTypes.find((item) => String(item.termType ?? "") === String(values.termType ?? ""));
  const currentTermTypeLabel = [currentTermType?.displayName, values.termType].filter(Boolean).join(" / ");
  const title = isTermType
    ? `${editor.mode === "create" ? "新增" : "编辑"} TermType`
    : `${editor.mode === "create" ? "新增" : "编辑"}标准值 - ${currentTermTypeLabel || values.termType || "-"}`;

  const missingCanonicalValue = !String(values.canonicalValue ?? "").trim();
  const missingDisplayName = !String(values.displayName ?? "").trim();
  const missingTermType = !String(values.termType ?? "").trim();
  const missingTermTypeKey = !String(values.termType ?? "").trim();
  const formId = isTermType ? "dictionary-term-type-editor-form" : "dictionary-value-editor-form";
  const inputClass = isTermType ? "h-10 text-sm" : "h-9 text-sm";

  const submit = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    setSubmitted(true);
    if (isTermType) {
      if (missingTermTypeKey || missingDisplayName) return;
    } else if (missingTermType || missingCanonicalValue || missingDisplayName) {
      return;
    }
    onSubmit();
  };

  const input = (key: string, placeholder?: string, type = "text", invalid = false) => (
    <Input
      type={type}
      className={`${inputClass} ${invalid ? "border-red-400 focus:border-red-500 focus:ring-red-100" : ""}`}
      value={values[key] ?? ""}
      placeholder={placeholder}
      onChange={(event: any) => onChange({ [key]: event.target.value })}
    />
  );

  const aliasInput = (
    <AliasTagInput
      value={values.aliases ?? ""}
      placeholder="添加 alias"
      onChange={(nextValue) => onChange({ aliases: nextValue })}
    />
  );

  return (
    <Modal
      open
      width={isTermType ? 760 : 380}
      title={title}
      onCancel={onClose}
      headerClassName={isTermType ? undefined : "px-5 py-3"}
      bodyClassName={isTermType ? undefined : "px-5 py-4"}
      footerClassName={isTermType ? undefined : "px-5 py-3"}
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" htmlType="submit" form={formId} loading={saving}>
            保存
          </Button>
        </>
      }
    >
      {isTermType ? (
        <form id={formId} className="space-y-4 text-sm" onSubmit={submit}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className={fieldClass}>
              <RequiredLabel>termType</RequiredLabel>
              {input("termType", "例如 metering_pump_model", "text", submitted && missingTermTypeKey)}
            </label>
            <label className={fieldClass}>
              <RequiredLabel>显示名</RequiredLabel>
              {input("displayName", "", "text", submitted && missingDisplayName)}
            </label>
            <label className={fieldClass}>
              <span className={fieldLabelClass}>报价显示名</span>
              {input("quoteDisplayName")}
            </label>
            <label className={fieldClass}>
              <span className={fieldLabelClass}>分类</span>
              {input("category")}
            </label>
            <label className={fieldClass}>
              <span className={fieldLabelClass}>值类型</span>
              <Select
                className={inputClass}
                value={values.valueKind ?? ""}
                placeholder="选择值类型"
                options={valueKindOptions}
                onChange={(value: string) => onChange({ valueKind: value })}
              />
            </label>
            <label className={fieldClass}>
              <span className={fieldLabelClass}>排序</span>
              {input("sortOrder", "", "number")}
            </label>
          </div>

          <section className={fieldClass}>
            <div className={fieldLabelClass}>适用产品范围</div>
            {productTypeOptions.length ? (
              <ProductScopeMultiSelect
                value={splitList(values.applicableProductTypes ?? "")}
                options={productTypeOptions}
                placeholder="搜索产品范围"
                onChange={(nextValues) => onChange({ applicableProductTypes: joinList(nextValues) })}
              />
            ) : (
              <div className="rounded-md border border-dashed border-slate-200 p-3 text-sm text-slate-400">
                暂无产品类型选项
              </div>
            )}
          </section>

          <label className={fieldClass}>
            <span className={fieldLabelClass}>Alias</span>
            {aliasInput}
          </label>
        </form>
      ) : (
        <form id={formId} className="w-[300px] max-w-full space-y-3 text-sm" onSubmit={submit}>
          <label className={fieldClass}>
            <RequiredLabel>标准值</RequiredLabel>
            {input("canonicalValue", "", "text", submitted && missingCanonicalValue)}
          </label>
          {submitted && missingCanonicalValue && <div className="-mt-2 text-xs text-red-500">请填写标准值</div>}

          <label className={fieldClass}>
            <RequiredLabel>显示名</RequiredLabel>
            {input("displayName", "", "text", submitted && missingDisplayName)}
          </label>
          {submitted && missingDisplayName && <div className="-mt-2 text-xs text-red-500">请填写显示名</div>}

          <label className={fieldClass}>
            <span className={fieldLabelClass}>Alias</span>
            {aliasInput}
          </label>
        </form>
      )}
    </Modal>
  );
}
