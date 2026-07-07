import { Rule } from "@/components/ui/types";

const DELIMITER = "~";

// 表单验证规则
export const powerInputRules: Rule[] = [
  {
    required: true,
    message: "请输入电压",
    validator: (_, value) => {
      if (!value?.voltage) {
        return Promise.reject(new Error("请输入电压"));
      }
      return Promise.resolve();
    },
  },
  {
    required: true,
    message: "请输入频率",
    validator: (_, value) => {
      if (!value?.frequency) {
        return Promise.reject(new Error("请输入频率"));
      }
      return Promise.resolve();
    },
  },
  {
    required: true,
    message: "请选择相类型",
    validator: (_: any, value) => {
      if (!value?.phase) {
        return Promise.reject(new Error("请选择相类型"));
      }
      return Promise.resolve();
    },
  },
];
export const DieWidthInputRule: Rule[] = [
  {
    required: true,
    message: "请选择宽度类型",
    validator: (_: any, value) => {
      if (!value?.widthType) {
        return Promise.reject(new Error("请选择宽度类型"));
      }
      return Promise.resolve();
    },
  },
  {
    required: true,
    message: "请输入宽度",
    validator: (_: any, value) => {
      if (!value?.length?.trim()) {
        return Promise.reject(new Error("请输入宽度"));
      }
      return Promise.resolve();
    },
  },
  {
    validator: (_: any, value) => {
      if (!value?.length?.trim()) {
        return Promise.resolve(); // 前一条规则已经处理了空值情况
      }

      // 检查是否是范围格式
      if (value.length.includes(DELIMITER)) {
        const parts = value.length
          .split(DELIMITER)
          .map((part: any) => part.trim());

        // 验证两部分都是有效数字
        if (parts.some((part: any) => !/^\d+$/.test(part))) {
          return Promise.reject(new Error("请输入有效的数字范围"));
        }

        const [first, second] = parts.map(Number);

        if (first >= second) {
          return Promise.reject(new Error("第一个数字必须小于第二个数字"));
        }
      }

      return Promise.resolve();
    },
  },
];
export const intervalInputRules: Rule[] = [
  {
    validator: (_: any, value: { value?: string }) => {
      const val = value?.value;
      if (!val || !val.includes(DELIMITER)) {
        return Promise.resolve();
      }
      const [first, second] = val.split(DELIMITER).map(parseFloat);

      if (!isNaN(first) && !isNaN(second) && first >= second) {
        return Promise.reject(new Error("第一个数字必须小于第二个数字"));
      }

      return Promise.resolve();
    },
  },
  {
    // required: true,
    validator: (_: any, value: { value?: string }) => {
      const val = value?.value;
      if (!val || !val.includes(DELIMITER)) {
        return Promise.resolve();
      }
      const [first, second] = val.split(DELIMITER).map(parseFloat);

      if (!isNaN(first) && !isNaN(second) && first <= second) {
        return Promise.reject(
          new Error("第一个数字为模头宽幅，第二个数字为挡块最小宽幅")
        );
      }

      return Promise.resolve();
    },
  },
];
export const autoCompleteIntervalInputRules: Rule[] = [
  {
    // required: true,
    validator: (_: any, value1: { value?: { value?: string } }) => {
      const val = value1?.value?.value;
      if (!val || !val.includes(DELIMITER)) {
        return Promise.resolve();
      }
      const [first, second] = val.split(DELIMITER).map(parseFloat);

      if (!isNaN(first) && !isNaN(second) && first >= second) {
        return Promise.reject(new Error("第一个数字必须小于第二个数字"));
      }

      return Promise.resolve();
    },
  },
];
export const RadioWithInputRules: Rule[] = [
  {
    required: true,
    validator: (
      _: any,
      value: { value: number | string; inputValue?: string }
    ) => {
      // 1. 首先检查是否选择了选项
      if (!value?.value) {
        return Promise.reject(new Error("请选择一个选项"));
      }

      // 2. 检查是否需要输入内容
      if (
        (value.value === "other" || value.value === "custom") &&
        !value.inputValue
      ) {
        return Promise.reject("请填写详细内容");
      }

      return Promise.resolve();
    },
  },
];
export const inputRule: Rule = {
  validator: (_: any, value: string) => {
    if (value.includes("【") || value.includes("】"))
      return Promise.reject("输入框中不应出现【】字符");

    return Promise.resolve();
  },
};
