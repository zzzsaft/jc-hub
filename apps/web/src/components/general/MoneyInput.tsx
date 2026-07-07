import { InputNumber, InputNumberProps, Select } from "@/components/ui/core";
import { useQuoteStore } from "@/store/useQuoteStore";
import { formatPrice } from "@/utils/value";
interface MoneyInputProps extends Omit<InputNumberProps, "value" | "onChange"> {
  quoteId: number;
  value?: number;
  onChange?: (value: number) => void;
  disabled?: boolean;
  readonly?: boolean;
}

export const MoneyInput: React.FC<MoneyInputProps> = ({
  quoteId,
  value,
  onChange,
  disabled,
  readonly,
  ...restProps
}) => {
  const currency =
    useQuoteStore(
      (state) => state.quotes.find((q) => q.id == quoteId)?.currencyType
    ) ?? "CNY";
  const updateQuote = useQuoteStore((state) => state.updateQuote);
  const selectBefore = (
    <Select
      defaultValue="CNY"
      value={currency}
      onChange={(val) => updateQuote(quoteId, { currencyType: val })}
      options={[
        { value: "CNY", label: "¥" },
        { value: "USD", label: "$", disabled: true },
      ]}
      disabled={disabled}
    />
  );
  const handleChange = (value: string | number | null) => {
    if (onChange) {
      // 处理各种可能的输入类型
      const numValue =
        typeof value === "string"
          ? parseFloat(value)
          : value === null
          ? 0
          : value;

      onChange(Number.isNaN(numValue) ? 0 : numValue);
    }
  };
  return (
    <InputNumber
      addonBefore={selectBefore}
      min={0}
      max={9999999}
      precision={2}
      value={value}
      onChange={handleChange}
      disabled={disabled}
      formatter={(value) => `${formatPrice(Number(value))}`}
      style={{ width: "100%", ...restProps.style }}
      controls={false}
      parser={(value) => Number(value?.replace(/[^\d.]/g, "")) || 0}
      {...restProps}
    />
  );
};
