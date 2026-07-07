import { Cascader, Spin } from "@/components/ui/core";
import type { CascaderProps } from "@/components/ui/core";
import * as _ from "lodash-es";
import { useEffect, useMemo, useState } from "react";
import { useQuoteStore } from "@/store/useQuoteStore";
import { SizeType } from "@/components/ui/types";
import { camelCase, groupBy, filter, map, isEmpty } from "lodash-es";
import { ProductCategory } from "@/types/types";
import { useProductStore } from "@/store/useProductStore";
interface ProductCascaderProps {
  value?: string | string[];
  style?: React.CSSProperties;
  onChange?: (value: string[], selectedProduct?: ProductCategory) => void;
  placeholder?: string;
  disabled?: boolean;
  size?: string;
}
interface Option {
  value: string;
  label: string;
  children?: Option[];
}
const ProductCascader: React.FC<ProductCascaderProps> = ({
  value,
  onChange,
  style = { width: "100%" },
  placeholder = "请选择产品",
  disabled = false,
  size = "medianum",
}) => {
  // 从 store 获取产品和加载状态
  const categories = useProductStore((state) => state.categories);
  const fetchCategories = useProductStore((state) => state.fetchCategories);
  const loading = useProductStore((state) => state.loading);

  // 如果 products 为空，自动获取数据
  useEffect(() => {
    if (categories.length === 0) {
      fetchCategories();
    }
  }, [categories.length, fetchCategories]);

  // 转换产品数据为级联选择器需要的格式
  const options = useMemo(() => {
    return buildHierarchy(categories);
  }, [categories]);

  // 处理默认值转换
  const [internalValue, setInternalValue] = useState<string[]>([]);

  useEffect(() => {
    if (typeof value === "string") {
      // 如果是字符串，查找对应的产品
      let product = categories.find((p) => p.level3Category === value);
      if (product) {
        setInternalValue([
          product.level1Category,
          product.level2Category,
          product.level3Category,
        ]);
      } else {
        product = categories.find((p) => p.level2Category === value);
        if (product) {
          setInternalValue([product.level1Category, product.level2Category]);
        } else {
          product = categories.find((p) => p.level1Category === value);
          if (product) {
            setInternalValue([product.level1Category]);
          }
        }
      }
    } else if (Array.isArray(value)) {
      // 如果是数组，直接使用
      setInternalValue(value);
    } else {
      setInternalValue([]);
    }
  }, [value, categories]);

  const handleChange = (value: string[], selectedOptions: any) => {
    setInternalValue(value);
    if (onChange) {
      onChange(value);
    }
  };

  if (loading) {
    return <Spin size="small" />;
  }

  return (
    <Cascader
      style={style}
      options={options}
      value={internalValue}
      onChange={handleChange}
      placeholder={placeholder}
      disabled={disabled || loading}
      // expandTrigger="hover"
      showSearch={{
        filter: (inputValue, path) => {
          return path.some((option) => {
            const label = option?.label?.toString() || "";
            return label.toLowerCase().includes(inputValue.toLowerCase());
          });
        },
      }}
      displayRender={(labels) => labels[labels.length - 1]}
      size={size as any}
    />
  );
};

const buildHierarchy = (items: any) => {
  // console.log("items", items);
  const level1 = map(groupBy(items, "level1Category"), (group, label) => {
    const node: Option = { value: label, label };
    const level2Items = filter(group, (item) => item.level2Category);

    if (!isEmpty(level2Items)) {
      node.children = map(
        groupBy(level2Items, "level2Category"),
        (group, label) => {
          const child: Option = { value: label, label };
          const level3Items = filter(group, (item) => item.level3Category);
          // console.log("level3Items", level3Items);
          if (!isEmpty(level3Items)) {
            child.children = map(level3Items, (item) => ({
              value: item.level3Category,
              label: item.level3Category,
            }));
          }

          return child;
        }
      );
    }

    return node;
  });
  // console.log("level1", level1);
  return level1;
};

export default ProductCascader;
