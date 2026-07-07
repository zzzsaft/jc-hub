import React, {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn, getByPath, setByPath } from "./utils";
import type {
  ColumnsType,
  DefaultOptionType,
  MenuProps,
  TablePaginationConfig,
  TableProps,
} from "./types";

type AnyProps = Record<string, any>;

const buttonBase =
  "inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-brand-200";
const inputBase =
  "h-8 w-full rounded border border-slate-300 bg-white px-2 text-sm outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-slate-100";

function eventValue(event: any) {
  if (event?.target) {
    if (event.target.type === "checkbox") return event.target.checked;
    return event.target.value;
  }
  return event;
}

function makeMessage(kind: "log" | "warn" | "error", text: any) {
  const value = typeof text === "string" ? text : text?.content ?? String(text ?? "");
  if (kind === "error") console.error(value);
  else if (kind === "warn") console.warn(value);
  else console.log(value);
}

export const message = {
  success: (text: any) => makeMessage("log", text),
  error: (text: any) => makeMessage("error", text),
  warning: (text: any) => makeMessage("warn", text),
  info: (text: any) => makeMessage("log", text),
  open: (config: any) => makeMessage("log", config),
};

function createFormInstance(initialValues: AnyProps = {}) {
  let values = { ...initialValues };
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  return {
    __subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getFieldValue(name: any) {
      return getByPath(values, name);
    },
    getFieldsValue() {
      return values;
    },
    setFieldsValue(next: AnyProps) {
      values = { ...values, ...next };
      notify();
    },
    setFieldValue(name: any, value: any) {
      values = setByPath(values, name, value);
      notify();
    },
    resetFields() {
      values = {};
      notify();
    },
    validateFields() {
      return Promise.resolve(values);
    },
    submit() {},
  };
}

const FormContext = createContext<any>(null);

function useForm(form?: any) {
  const ref = useRef<any>(form || createFormInstance());
  return [form || ref.current];
}

function useWatch(name: any, form?: any) {
  const contextForm = useContext(FormContext);
  const activeForm = form || contextForm;
  const [, force] = useState(0);
  useEffect(() => {
    if (!activeForm?.__subscribe) return undefined;
    return activeForm.__subscribe(() => force((value) => value + 1));
  }, [activeForm]);
  return activeForm?.getFieldValue?.(name);
}

function useFormInstance() {
  return useContext(FormContext) || createFormInstance();
}

function FormRoot({ form, initialValues, onFinish, children, className, layout, ...props }: AnyProps) {
  const [createdForm] = useForm(form);
  useEffect(() => {
    if (initialValues) createdForm.setFieldsValue(initialValues);
  }, []);
  return (
    <FormContext.Provider value={createdForm}>
      <form
        className={cn(layout === "inline" ? "flex flex-wrap items-end gap-3" : "space-y-3", className)}
        onSubmit={(event) => {
          event.preventDefault();
          onFinish?.(createdForm.getFieldsValue());
        }}
        {...props}
      >
        {children}
      </form>
    </FormContext.Provider>
  );
}

function FormItem({
  name,
  label,
  children,
  className,
  noStyle,
  valuePropName,
  dependencies,
  rules,
  ...props
}: AnyProps) {
  const form = useContext(FormContext);
  const [, force] = useState(0);
  useEffect(() => {
    if (!form?.__subscribe) return undefined;
    return form.__subscribe(() => force((value) => value + 1));
  }, [form]);
  if (typeof children === "function") return <>{children(form?.getFieldsValue?.() || {})}</>;
  const value = name != null ? form?.getFieldValue?.(name) : undefined;
  const controlledChild =
    name != null && React.isValidElement(children)
      ? React.cloneElement(children as any, {
          [valuePropName || "value"]: value,
          onChange: (...args: any[]) => {
            (children as any).props?.onChange?.(...args);
            form?.setFieldValue?.(name, eventValue(args[0]));
          },
        })
      : children;
  const required = rules?.some?.((rule: any) => rule.required);
  const content = (
    <>
      {label && (
        <label className="mb-1 block text-sm font-medium text-slate-700">
          {label}
          {required && <span className="ml-1 text-red-500">*</span>}
        </label>
      )}
      {controlledChild}
    </>
  );
  if (noStyle) return <>{content}</>;
  return (
    <div className={cn("min-w-0", className)} {...props}>
      {content}
    </div>
  );
}

function FormList({ name, children }: AnyProps) {
  const form = useContext(FormContext);
  const rows = form?.getFieldValue?.(name) || [];
  const fields = rows.map((_: any, index: number) => ({ key: index, name: index }));
  const operations = {
    add(defaultValue: any = {}) {
      form?.setFieldValue?.(name, [...rows, defaultValue]);
    },
    remove(index: number) {
      form?.setFieldValue?.(
        name,
        rows.filter((_: any, rowIndex: number) => rowIndex !== index),
      );
    },
  };
  return <>{children?.(fields, operations)}</>;
}

export const Form = Object.assign(FormRoot, {
  Item: FormItem,
  List: FormList,
  useForm,
  useWatch,
  useFormInstance,
  Context: FormContext,
});

export const Button = forwardRef<HTMLButtonElement, AnyProps>(
  ({ type, danger, loading, icon, block, className, children, htmlType, ...props }, ref) => (
    <button
      ref={ref}
      type={htmlType || "button"}
      className={cn(
        buttonBase,
        type === "primary"
          ? "border-brand-600 bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-700"
          : type === "link"
            ? "min-h-0 border-transparent bg-transparent px-1 py-0 text-brand-600 shadow-none hover:text-brand-700 focus:ring-0"
            : type === "text"
              ? "border-transparent bg-transparent text-slate-600 shadow-none hover:bg-slate-100 hover:text-slate-900"
              : "border-slate-300 bg-white text-slate-700 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 active:bg-brand-100",
        danger && "border-red-500 text-red-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700",
        block && "w-full",
        className,
      )}
      disabled={props.disabled || loading}
      {...props}
    >
      {loading ? <Spinner size="small" /> : icon}
      {children}
    </button>
  ),
);

const TextArea = forwardRef<HTMLTextAreaElement, AnyProps>(({ className, rows = 3, ...props }, ref) => (
  <textarea
    ref={ref}
    rows={rows}
    className={cn(inputBase, "h-auto min-h-20 py-2", className)}
    {...props}
  />
));

const InputRoot = forwardRef<HTMLInputElement, AnyProps>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(inputBase, className)} {...props} />
));

export const Input = Object.assign(InputRoot, {
  TextArea,
});

export const InputNumber = forwardRef<HTMLInputElement, AnyProps>(({ className, addonAfter, ...props }, ref) => (
  <div className="flex w-full">
    <input
      ref={ref}
      type="number"
      className={cn(inputBase, addonAfter && "rounded-r-none", className)}
      {...props}
    />
    {addonAfter && (
      <span className="inline-flex h-8 items-center rounded-r border border-l-0 border-slate-300 bg-slate-50 px-2 text-sm text-slate-500">
        {addonAfter}
      </span>
    )}
  </div>
));

function renderOption(option: any) {
  return option?.label ?? option?.children ?? option?.value ?? option;
}

function SelectRoot({ options, children, className, mode, onChange, value, placeholder, ...props }: AnyProps) {
  const childOptions = React.Children.toArray(children)
    .filter(React.isValidElement)
    .map((child: any) => ({ value: child.props.value, label: child.props.children }));
  const mergedOptions = options || childOptions;
  return (
    <select
      className={cn(inputBase, className)}
      multiple={mode === "multiple"}
      value={value as any}
      onChange={(event) => onChange?.(event.target.value, mergedOptions.find((item: any) => String(item.value) === event.target.value))}
      {...props}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {mergedOptions?.map((option: any) => (
        <option key={String(option.value)} value={String(option.value)} disabled={option.disabled}>
          {renderOption(option)}
        </option>
      ))}
    </select>
  );
}

const SelectOption = ({ children }: AnyProps) => <>{children}</>;
export const Select = Object.assign(SelectRoot, { Option: SelectOption });

export const AutoComplete = ({ children, options, onSelect, onChange, value, className, ...props }: AnyProps) => (
  <div className="relative w-full">
    {React.isValidElement(children)
      ? React.cloneElement(children as any, { value, onChange, className })
      : <Input value={value} onChange={(event: any) => onChange?.(event.target.value)} className={className} {...props} />}
    {!!options?.length && (
      <div className="absolute z-50 mt-1 max-h-52 w-full overflow-auto rounded border border-slate-200 bg-white shadow-lg">
        {options.map((option: DefaultOptionType) => (
          <button
            type="button"
            key={String(option.value)}
            className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
            onMouseDown={(event) => {
              event.preventDefault();
              onSelect?.(option.value, option);
            }}
          >
            {renderOption(option)}
          </button>
        ))}
      </div>
    )}
  </div>
);

export const Cascader = ({ options = [], onChange, value, placeholder, className, ...props }: AnyProps) => (
  <Select
    className={className}
    value={Array.isArray(value) ? value[value.length - 1] : value}
    placeholder={placeholder}
    options={options.flatMap(function flatten(option: any): any[] {
      return option.children?.length ? option.children.flatMap(flatten) : [option];
    })}
    onChange={(next: any) => onChange?.([next])}
    {...props}
  />
);

export const Checkbox = Object.assign(
  ({ children, checked, onChange, className, ...props }: AnyProps) => (
    <label className={cn("inline-flex items-center gap-2 text-sm text-slate-700", className)}>
      <input type="checkbox" checked={checked} onChange={onChange} className="h-4 w-4 rounded border-slate-300 text-brand-600" {...props} />
      {children}
    </label>
  ),
  {
    Group: ({ options = [], value = [], onChange, className }: AnyProps) => (
      <div className={cn("flex flex-wrap gap-3", className)}>
        {options.map((option: any) => (
          <Checkbox
            key={String(option.value ?? option)}
            checked={value.includes(option.value ?? option)}
            onChange={(event: any) => {
              const nextValue = option.value ?? option;
              onChange?.(event.target.checked ? [...value, nextValue] : value.filter((item: any) => item !== nextValue));
            }}
          >
            {option.label ?? option}
          </Checkbox>
        ))}
      </div>
    ),
  },
);

function RadioRoot({ children, value, checked, onChange, className, ...props }: AnyProps) {
  return (
    <label className={cn("inline-flex items-center gap-2 text-sm text-slate-700", className)}>
      <input type="radio" value={String(value)} checked={checked} onChange={() => onChange?.({ target: { value } })} className="h-4 w-4 text-brand-600" {...props} />
      {children}
    </label>
  );
}

export const Radio = Object.assign(RadioRoot, {
  Button: RadioRoot,
  Group: ({ children, value, onChange, className, options }: AnyProps) => (
    <div className={cn("flex flex-wrap gap-3", className)}>
      {options
        ? options.map((option: any) => (
            <Radio key={String(option.value)} value={option.value} checked={value === option.value} onChange={onChange}>
              {option.label}
            </Radio>
          ))
        : React.Children.map(children, (child: any) =>
            React.isValidElement(child)
              ? React.cloneElement(child as any, {
                  checked: (child as any).props.value === value,
                  onChange,
                })
              : child,
          )}
    </div>
  ),
});

export const Switch = ({ checked, onChange, className, ...props }: AnyProps) => (
  <button
    type="button"
    className={cn("relative h-5 w-9 rounded-full transition", checked ? "bg-brand-600" : "bg-slate-300", className)}
    onClick={() => onChange?.(!checked)}
    {...props}
  >
    <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white transition", checked ? "left-4" : "left-0.5")} />
  </button>
);

export function Segmented<T = any>({ options = [], value, onChange, className }: AnyProps) {
  return (
    <div className={cn("inline-flex rounded border border-slate-200 bg-slate-50 p-0.5", className)}>
      {options.map((option: any) => {
        const optionValue = option.value ?? option;
        return (
          <button
            type="button"
            key={String(optionValue)}
            onClick={() => onChange?.(optionValue as T)}
            className={cn("rounded px-3 py-1 text-sm", value === optionValue ? "bg-white text-brand-600 shadow-sm" : "text-slate-600")}
          >
            {option.label ?? option}
          </button>
        );
      })}
    </div>
  );
}

export const DatePicker = ({ value, onChange, className, ...props }: AnyProps) => (
  <Input
    type="date"
    className={className}
    value={value?.format?.("YYYY-MM-DD") ?? value ?? ""}
    onChange={(event: any) => onChange?.(event.target.value)}
    {...props}
  />
);

export const Row = ({ children, gutter, className, ...props }: AnyProps) => (
  <div className={cn("flex flex-wrap", gutter && "-mx-2", className)} {...props}>
    {children}
  </div>
);

export const Col = ({ children, xs, sm, md, lg, span, className, ...props }: AnyProps) => (
  <div className={cn("min-w-0 px-2", span || xs ? `w-${Math.min(span || xs, 24)}/24` : "w-full", md && "md:w-auto md:flex-1", className)} {...props}>
    {children}
  </div>
);

export const Space = Object.assign(
  ({ children, direction, className, size, align, ...props }: AnyProps) => (
    <div className={cn(direction === "vertical" ? "flex flex-col" : "inline-flex flex-wrap", "gap-2", align === "center" && "items-center", className)} {...props}>
      {children}
    </div>
  ),
  {
    Compact: ({ children, className, block, ...props }: AnyProps) => (
      <div className={cn("inline-flex", block && "flex w-full", className)} {...props}>
        {children}
      </div>
    ),
  },
);

export const Card = ({ title, children, className, extra, ...props }: AnyProps) => (
  <section className={cn("rounded border border-slate-200 bg-white p-4 shadow-sm", className)} {...props}>
    {(title || extra) && (
      <div className="mb-3 flex items-center justify-between gap-3 border-b border-slate-100 pb-2">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        {extra}
      </div>
    )}
    {children}
  </section>
);

export const Divider = ({ className, ...props }: AnyProps) => <hr className={cn("my-3 border-slate-200", className)} {...props} />;

export const Tag = Object.assign(
  ({ children, color, className, checked, onChange, ...props }: AnyProps) => (
    <span
      className={cn(
        "inline-flex items-center rounded border px-2 py-0.5 text-xs",
        checked ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 bg-slate-50 text-slate-700",
        color === "red" && "border-red-200 bg-red-50 text-red-700",
        color === "gold" && "border-amber-200 bg-amber-50 text-amber-700",
        color === "cyan" && "border-cyan-200 bg-cyan-50 text-cyan-700",
        className,
      )}
      onClick={() => onChange?.(!checked)}
      {...props}
    >
      {children}
    </span>
  ),
  {
    CheckableTag: ({ checked, onChange, children, className }: AnyProps) => (
      <button
        type="button"
        className={cn(
          "rounded border px-2 py-0.5 text-xs",
          checked ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 bg-white text-slate-600",
          className,
        )}
        onClick={() => onChange?.(!checked)}
      >
        {children}
      </button>
    ),
  },
);

export const Badge = ({ children, count, className }: AnyProps) => (
  <span className={cn("relative inline-flex", className)}>
    {children}
    {count != null && <span className="ml-1 rounded-full bg-red-500 px-1 text-xs text-white">{count}</span>}
  </span>
);

export const Avatar = ({ src, icon, children, size = "default", className, ...props }: AnyProps) => (
  <span
    className={cn(
      "inline-flex items-center justify-center overflow-hidden rounded-full bg-slate-200 text-slate-600",
      size === "small" ? "h-6 w-6 text-xs" : "h-8 w-8 text-sm",
      className,
    )}
    {...props}
  >
    {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : children || icon}
  </span>
);

export function Spinner({ size, tip }: AnyProps) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-slate-500">
      <span className={cn("inline-block animate-spin rounded-full border-2 border-slate-300 border-t-brand-600", size === "large" ? "h-8 w-8" : "h-4 w-4")} />
      {tip}
    </span>
  );
}

export const Spin = Spinner;
export const Skeleton = ({ active, className }: AnyProps) => <div className={cn("h-24 animate-pulse rounded bg-slate-100", className)} />;

export const Typography = {
  Title: ({ level = 1, children, className, ...props }: AnyProps) => {
    const TagName = `h${level}` as any;
    return <TagName className={cn("font-semibold text-slate-900", level <= 3 ? "text-xl" : "text-base", className)} {...props}>{children}</TagName>;
  },
  Text: ({ children, type, className, ...props }: AnyProps) => (
    <span className={cn(type === "secondary" ? "text-slate-500" : "text-slate-700", className)} {...props}>
      {children}
    </span>
  ),
  Paragraph: ({ children, className, ...props }: AnyProps) => <p className={cn("text-sm text-slate-700", className)} {...props}>{children}</p>,
};

export const Modal = Object.assign(
  ({
    open,
    visible,
    title,
    children,
    footer,
    onCancel,
    onOk,
    width,
    className,
    headerClassName,
    bodyClassName,
    footerClassName,
    maskClosable,
    ...props
  }: AnyProps) => {
    if (!(open ?? visible)) return null;
    return (
      <div
        className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-4"
        onMouseDown={(event) => {
          if (maskClosable && event.target === event.currentTarget) onCancel?.();
        }}
      >
        <div className={cn("flex max-h-[90vh] w-full flex-col overflow-hidden rounded bg-white shadow-xl", className)} style={{ maxWidth: width || 640 }} {...props}>
          <div className={cn("shrink-0 flex items-center justify-between border-b border-slate-100 bg-white px-4 py-3", headerClassName)}>
            <h3 className="min-w-0 flex-1 font-semibold text-slate-900">{title}</h3>
            <button
              type="button"
              aria-label="关闭"
              className="inline-flex h-8 w-8 appearance-none items-center justify-center rounded-md border-0 bg-transparent p-0 text-xl leading-none text-slate-400 shadow-none transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-200"
              onClick={onCancel}
            >
              &times;
            </button>
          </div>
          <div className={cn("min-h-0 flex-1 overflow-auto p-4", bodyClassName)}>{children}</div>
          {footer !== null && (
            <div className={cn("shrink-0 flex justify-end gap-2 border-t border-slate-100 bg-white px-4 py-3", footerClassName)}>
              {footer || (
                <>
                  <Button onClick={onCancel}>取消</Button>
                  <Button type="primary" onClick={onOk}>确定</Button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    );
  },
  {
    info: ({ title, content }: AnyProps) => window.alert?.(`${title ?? ""}\n${content ?? ""}`),
    error: ({ title, content }: AnyProps) => window.alert?.(`${title ?? ""}\n${content ?? ""}`),
    confirm: ({ title, content, onOk }: AnyProps) => {
      if (window.confirm?.(`${title ?? ""}\n${content ?? ""}`)) onOk?.();
    },
  },
);

export const Empty = Object.assign(
  ({ description }: AnyProps) => (
    <div className="flex min-h-32 items-center justify-center rounded border border-dashed border-slate-200 p-6 text-sm text-slate-500">
      {description || "No data"}
    </div>
  ),
  { PRESENTED_IMAGE_SIMPLE: "simple" },
);

export const Popover = ({ children, content, title }: AnyProps) => (
  <span className="group relative inline-flex">
    {children}
    <span className="invisible absolute right-0 top-full z-50 mt-2 min-w-56 rounded border border-slate-200 bg-white p-3 text-sm text-slate-700 shadow-lg group-hover:visible">
      {title && <strong className="mb-1 block text-slate-900">{title}</strong>}
      {content}
    </span>
  </span>
);

export const Tooltip = ({ children, title }: AnyProps) => (
  <span title={typeof title === "string" ? title : undefined}>{children}</span>
);

export const Dropdown = ({ children, menu }: AnyProps) => (
  <span className="group relative inline-flex">
    {children}
    {!!menu?.items?.length && (
      <div className="invisible absolute right-0 top-full z-50 mt-1 min-w-36 rounded border border-slate-200 bg-white py-1 shadow-lg group-hover:visible">
        {menu.items.map((item: any) => (
          <button
            type="button"
            key={String(item.key)}
            disabled={item.disabled}
            className={cn("flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50", item.danger && "text-red-600")}
            onClick={(event) => menu.onClick?.({ key: String(item.key), domEvent: event })}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>
    )}
  </span>
);

export const Menu = ({ items = [], selectedKeys = [], onClick, className }: AnyProps) => (
  <nav className={cn("space-y-1 p-2", className)}>
    {items.map((item: any) => (
      <button
        type="button"
        key={String(item.key)}
        className={cn(
          "flex w-full items-center gap-2 rounded-md border border-transparent px-3 py-2 text-left text-sm font-medium text-slate-600 transition hover:border-slate-200 hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-200",
          selectedKeys.includes(item.key) && "border-brand-100 bg-brand-50 text-brand-700 shadow-sm",
        )}
        onClick={() => onClick?.({ key: item.key })}
      >
        {item.icon}
        {item.label}
      </button>
    ))}
  </nav>
);

export const Layout = Object.assign(
  ({ children, className, ...props }: AnyProps) => <div className={cn("min-h-full", className)} {...props}>{children}</div>,
  {
    Header: ({ children, className, ...props }: AnyProps) => <header className={className} {...props}>{children}</header>,
    Sider: ({ children, className, width, ...props }: AnyProps) => <aside className={className} style={{ width, ...props.style }} {...props}>{children}</aside>,
    Content: ({ children, className, ...props }: AnyProps) => <main className={className} {...props}>{children}</main>,
  },
);

export default Layout;
export const Header = Layout.Header;
export const Sider = Layout.Sider;
export const Content = Layout.Content;

export const Tabs = ({ items, activeKey, defaultActiveKey, onChange, children, className }: AnyProps) => {
  const [internal, setInternal] = useState(defaultActiveKey || items?.[0]?.key);
  const key = activeKey ?? internal;
  const activeItem = items?.find((item: any) => item.key === key);
  return (
    <div className={className}>
      <div className="mb-3 flex gap-1 border-b border-slate-200">
        {items?.map((item: any) => (
          <button
            type="button"
            key={item.key}
            className={cn("px-3 py-2 text-sm", key === item.key ? "border-b-2 border-brand-600 text-brand-700" : "text-slate-500")}
            onClick={() => {
              setInternal(item.key);
              onChange?.(item.key);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      {activeItem?.children ?? children}
    </div>
  );
};

export const Pagination = ({ current = 1, pageSize = 10, total = 0, onChange, className }: AnyProps) => (
  <div className={cn("flex items-center justify-end gap-2 text-sm", className)}>
    <Button disabled={current <= 1} onClick={() => onChange?.(current - 1, pageSize)}>Prev</Button>
    <span>{current} / {Math.max(1, Math.ceil(total / pageSize))}</span>
    <Button disabled={current >= Math.ceil(total / pageSize)} onClick={() => onChange?.(current + 1, pageSize)}>Next</Button>
  </div>
);

export function Table<T = any>({
  columns = [],
  dataSource = [],
  rowKey,
  loading,
  pagination,
  className,
  onChange,
  components,
  onRow,
}: TableProps<T>) {
  const getKey = (record: any, index: number) => typeof rowKey === "function" ? rowKey(record) : rowKey ? record[rowKey] : record.key ?? index;
  const HeaderCell = components?.header?.cell || "th";
  const totalColumnWidth = (columns as ColumnsType<T>).reduce(
    (sum, column: any) => sum + (Number(column.width) || 0),
    0,
  );
  return (
    <div className={cn("overflow-auto rounded border border-slate-200 bg-white", className)}>
      {loading && <div className="p-4"><Spinner /></div>}
      <table
        className="min-w-full table-fixed divide-y divide-slate-200 text-sm"
        style={totalColumnWidth ? { width: totalColumnWidth } : undefined}
      >
        <colgroup>
          {(columns as ColumnsType<T>).map((column: any, index) => (
            <col
              key={String(column.key ?? column.dataIndex ?? index)}
              style={column.width ? { width: Number(column.width) } : undefined}
            />
          ))}
        </colgroup>
        <thead className="bg-slate-50">
          <tr>
            {(columns as ColumnsType<T>).map((column: any, index) => (
              <HeaderCell
                key={String(column.key ?? column.dataIndex ?? index)}
                className={cn("relative px-3 py-2 text-left font-medium text-slate-600", column.align === "right" && "text-right", column.align === "center" && "text-center")}
                style={{ width: column.width }}
                {...column.onHeaderCell?.(column)}
              >
                {column.title}
              </HeaderCell>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {dataSource.map((record: any, rowIndex: number) => {
            const rowProps = onRow?.(record, rowIndex) ?? {};
            return (
            <tr
              key={String(getKey(record, rowIndex))}
              {...rowProps}
              className={cn("hover:bg-slate-50", rowProps.className)}
            >
              {(columns as ColumnsType<T>).map((column: any, colIndex) => {
                const value = Array.isArray(column.dataIndex) ? getByPath(record, column.dataIndex) : record[column.dataIndex];
                return (
                  <td
                    key={String(column.key ?? column.dataIndex ?? colIndex)}
                    className={cn("px-3 py-2 text-slate-700", column.align === "right" && "text-right", column.align === "center" && "text-center")}
                    style={{ width: column.width }}
                  >
                    {column.render ? column.render(value, record, rowIndex) : value}
                  </td>
                );
              })}
            </tr>
            );
          })}
        </tbody>
      </table>
      {!!pagination && (
        <div className="border-t border-slate-100 p-3">
          <Pagination {...(pagination as TablePaginationConfig)} onChange={(page: number, size: number) => onChange?.({ current: page, pageSize: size }, {}, {})} />
        </div>
      )}
    </div>
  );
}

export const Result = ({ status, title, subTitle, extra }: AnyProps) => (
  <div className="flex min-h-80 flex-col items-center justify-center p-8 text-center">
    <div className="mb-3 text-4xl">{status === "403" ? "403" : "!"}</div>
    <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
    <p className="mt-2 text-sm text-slate-500">{subTitle}</p>
    <div className="mt-5 flex gap-2">{extra}</div>
  </div>
);

export const Watermark = ({ children, content }: AnyProps) => (
  <div className="relative">
    {children}
    {content && <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-4xl font-bold text-slate-200/40 rotate-[-20deg]">{content}</div>}
  </div>
);

export const Upload = ({ children }: AnyProps) => <>{children}</>;

export const App = Object.assign(
  ({ children }: AnyProps) => <>{children}</>,
  {
    useApp: () => ({ message, modal: Modal, notification: message }),
  },
);

export function useApp() {
  return App.useApp();
}


export const theme = {
  useToken: () => ({
    token: {
      colorBgContainer: "rgb(var(--color-bg-panel))",
      colorBgLayout: "rgb(var(--color-bg-app))",
      colorBorder: "rgb(var(--color-line-default))",
      colorPrimary: "rgb(var(--color-brand-500))",
      colorText: "rgb(var(--color-text-primary))",
      colorTextSecondary: "rgb(var(--color-text-muted))",
      borderRadiusLG: 6,
    },
  }),
};

export type { MenuProps };
export * from "./types";
