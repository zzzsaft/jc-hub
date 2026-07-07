import { App, Tabs, Typography } from "@/components/ui/core";
import { FormInstance } from "@/components/ui/core";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { QuoteItem, QuoteTemplate } from "@/types/types";

import { getFormByCategory, ModelFormRef } from "./formSelector";
import { useQuoteStore } from "@/store/useQuoteStore";
import PriceForm from "@/components/quoteForm/PriceForm";

interface ProductConfigurationFormProps {
  quoteItem?: QuoteItem;
  quoteId: number;
  material?: string[];
  finalProduct?: string;
  style?: any;
  showPrice?: boolean;
  readOnly?: boolean;
  formType?: string;
  quoteTemplate?: QuoteTemplate;
  isClosed?: boolean;
}
const ProductConfigurationForm = forwardRef(
  (
    {
      quoteItem,
      quoteId,
      material = [],
      finalProduct = "",
      style,
      showPrice = true,
      readOnly = false,
      formType: formTypeProp,
      quoteTemplate,
      isClosed = false,
    }: ProductConfigurationFormProps,
    ref
  ) => {
    const { modal } = App.useApp();
    const priceFormRef = useRef<{ form: FormInstance }>(null);
    const modelFormRef = useRef<{ form: FormInstance }>(null);
    const updateItem = useQuoteStore((state) => state.updateQuoteItem);

    const [activeKey, setActiveKey] = useState("1");
    useEffect(() => {
      modelFormRef.current?.form.setFieldsValue(quoteTemplate?.config);
    }, [quoteTemplate?.config]);
    const generateName = () => {
      const category = quoteItem?.productCategory;
      if (!category) return "";

      if (category[0] === "平模") {
        if (!finalProduct) {
          modal.error({
            title: "最终产品未填写",
            content: "请填写最终产品",
          });
          return "";
        }
        const width = modelFormRef.current?.form.getFieldValue("dieWidth");
        const material1 = modelFormRef.current?.form.getFieldValue("material");
        const widthStr = width && width.front ? `${width.front}mm` : "";
        const mat = material1?.join("、");
        const upperLip =
          modelFormRef.current?.form.getFieldValue("upperLipStructure");
        const manualOrAuto =
          typeof upperLip === "string" && upperLip.includes("自动")
            ? "自动"
            : "手动";
        const extrudeType = modelFormRef.current?.form.getFieldValue(
          "extrudeType"
        );
        const runnerNumber =
          modelFormRef.current?.form.getFieldValue("runnerNumber") ?? 0;
        const runnerStr =
          extrudeType &&
          ["模内共挤", "分配器+模内共挤"].includes(extrudeType) &&
          runnerNumber > 1
            ? `${runnerNumber}层${extrudeType}`
            : "";
        const final = finalProduct ?? "";
        return `${widthStr}${mat}${runnerStr}${final}${manualOrAuto}模头`;
      }

      if (category.at(-1) === "共挤复合分配器") {
        const layers = modelFormRef.current?.form.getFieldValue("layers");
        const extruder =
          modelFormRef.current?.form.getFieldValue("extruderNumber");
        if (layers && extruder) {
          return `${layers}共挤复合分配器（${extruder}）`;
        }
      }

      if (category.at(-1) === "熔体计量泵") {
        const model = modelFormRef.current?.form.getFieldValue("model");
        if (model) {
          return `${model}熔体计量泵`;
        }
      }
      if (category.at(-1) === "过滤器") {
        const model = modelFormRef.current?.form.getFieldValue("model");
        const name = modelFormRef.current?.form.getFieldValue("name");
        if (model) {
          return `${model}${name}`;
        }
      }

      if (category.includes("液压站")) {
        const model = modelFormRef.current?.form.getFieldValue("valveShare");
        if (model) {
          return `${model}阀液压站`;
        }
      }

      if (category.at(-1) === "测厚仪") {
        const model = modelFormRef.current?.form.getFieldValue("model");
        const width = modelFormRef.current?.form.getFieldValue("width");
        if (model) {
          return `${model}-${width}测厚仪`;
        }
      }
      return category.at(-1);
    };
    const { form, formType } = getFormByCategory(
      quoteItem?.productCategory,
      quoteId,
      quoteItem?.id ?? 0,
      modelFormRef,
      formTypeProp,
      readOnly
    );

    useEffect(() => {
      if (quoteItem?.id && quoteItem.formType !== formType) {
        updateItem(quoteId, quoteItem.id, { formType });
      }
    }, [formType, quoteItem?.id]);

    // 暴露priceForm给祖父组件
    useImperativeHandle(ref, () => {
      return {
        priceForm: priceFormRef?.current?.form,
        modelForm: modelFormRef.current?.form,
        switchTab: (key: string) => setActiveKey(key),
      };
    });
    return (
      <div style={{ position: "relative", ...style }}>
        <Tabs
          centered
          activeKey={activeKey}
          onChange={setActiveKey}
          defaultActiveKey="1"
          items={((): any[] => {
            const arr = [
              {
                label: "规格配置",
                key: "1",
                children: form,
                forceRender: true,
              },
            ];
            if (showPrice) {
              arr.push({
                label: "价格配置",
                key: "2",
                children: (
                  <PriceForm
                    ref={priceFormRef}
                    onGenerateName={generateName}
                    readOnly={readOnly}
                    showProductCode={isClosed}
                  />
                ),
                forceRender: true,
              });
            }
            return arr;
          })()}
        />
        {readOnly && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 10,
            }}
          />
        )}
      </div>
    );
  }
);
export default ProductConfigurationForm;
