import type React from "react";

export type Rule = {
  required?: boolean;
  message?: string;
  pattern?: RegExp;
  validator?: (...args: any[]) => Promise<void> | void;
  [key: string]: any;
};

export type DefaultOptionType = {
  label?: React.ReactNode;
  value?: any;
  children?: DefaultOptionType[];
  disabled?: boolean;
  [key: string]: any;
};

export type SelectProps<T = any> = any;
export type CascaderProps = any;
export type FormItemProps = any;
export type InputProps = any;
export type InputNumberProps = any;
export type ButtonProps = any;
export type RadioChangeEvent = any;
export type RadioGroupProps = any;
export type PopoverProps = any;
export type ColProps = any;
export type FormInstance = any;
export type SizeType = "small" | "middle" | "large" | undefined;

export type ColumnsType<T = any> = Array<{
  title?: React.ReactNode;
  dataIndex?: keyof T | string | Array<string | number>;
  key?: React.Key;
  render?: (value: any, record: T, index: number) => React.ReactNode;
  sorter?: any;
  width?: number | string;
  align?: "left" | "right" | "center";
  [key: string]: any;
}>;

export type TablePaginationConfig = {
  current?: number;
  pageSize?: number;
  total?: number;
  showSizeChanger?: boolean;
  [key: string]: any;
};

export type SorterResult<T = any> = {
  column?: any;
  order?: "ascend" | "descend" | null;
  field?: keyof T | string;
  columnKey?: React.Key;
  [key: string]: any;
};

export type MenuProps = {
  items?: Array<{
    key?: React.Key;
    label?: React.ReactNode;
    icon?: React.ReactNode;
    type?: string;
    danger?: boolean;
    disabled?: boolean;
    children?: any[];
    [key: string]: any;
  }>;
  onClick?: (info: { key: string; domEvent?: React.MouseEvent }) => void;
  [key: string]: any;
};

export type TableProps<T = any> = {
  columns?: ColumnsType<T>;
  dataSource?: T[];
  rowKey?: any;
  pagination?: false | TablePaginationConfig;
  loading?: boolean;
  onChange?: (...args: any[]) => void;
  [key: string]: any;
};

export type ProFromListCommonProps = any;
export type TailFormListProps = any;
