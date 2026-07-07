// 格式化千分位
export const formatPrice = (
  value: number,
  minimumFractionDigits: number = 0,
  maximumFractionDigits: number = 2
) => {
  return new Intl.NumberFormat("zh-CN", {
    style: "decimal",
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(value);
};
// 将分组数据转换为 Select 需要的格式
export const selectOptions = (groups: Record<string, string[]>) =>
  Object.entries(groups).map(([groupName, items]) => ({
    label: groupName,
    options: items.map((item) => ({
      label: item,
      value: item,
    })),
  }));

export function insertAfter<T>(
  arr: T[],
  predicate: (item: T) => boolean,
  newItem: T
): T[] {
  const index = arr.findIndex(predicate);
  if (index === -1) return [...arr, newItem]; // 未找到则追加到末尾
  return [...arr.slice(0, index + 1), newItem, ...arr.slice(index + 1)];
}

export const parseNumber = (
  value: string | number | undefined,
  reg: RegExp
): number | undefined => {
  if (value === undefined) return undefined;
  return Number(String(value).replace(reg, "")) || 0;
};
