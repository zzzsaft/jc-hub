import { Form, FormInstance } from "@/components/ui/core";
import { forwardRef, useImperativeHandle, useRef } from "react";
import { Product } from "../dieForm/Product";
import { DieBody } from "../dieForm/DieBody";
import { DieInstall } from "../dieForm/DieInstall";
import { TemperatureControl } from "../dieForm/TemperatureControl";
import { SurfaceTreatment } from "../dieForm/SurfaceTreatment";
import { SameProduct } from "../dieForm/SameProduct";
import TailForm from "@/components/ui/proForm";
import TextArea from "@/components/ui/TextArea";
import useProductActionModal from "@/hooks/showProductActionModal";
import { useQuoteStore } from "@/store/useQuoteStore";
import { ModelSelection } from "./ModelSelection";
import { useProductStore } from "@/store/useProductStore";
import { ModelOption } from "./ModelOption";
import { parseNumber } from "@/utils/value";
interface PriceFormRef {
  form: FormInstance; // 明确定义暴露的form实例
}

const MeteringPumpForm = forwardRef(
  (
    {
      quoteId,
      quoteItemId,
      readOnly = false,
    }: { quoteId: number; quoteItemId: number; readOnly?: boolean },
    ref
  ) => {
    const [form] = Form.useForm();
    const optionsRef = useRef<string[]>([]);
    const quoteItems = useQuoteStore
      .getState()
      .quotes.find((quote) => quote.id === quoteId)?.items;
    const quoteType = useQuoteStore(
      (state) => state.quotes.find((q) => q.id === quoteId)?.type
    );
    const { showProductActionModal } = useProductActionModal();
    const pump = useProductStore((state) => state.pump);
    const addProp: any = (
      productCategory: string[],
      key: string,
      value: any
    ) => ({
      method: "add",
      quoteId,
      quoteItems,
      productCategory,
      productName: productCategory.at(-1) ?? "",
      linkId: quoteItemId,
      source: {
        name: productCategory.at(-1),
        value,
        key,
      },
    });
    const deleteProp: any = (productCategory: string[]) =>
      ({
        method: "delete",
        linkId: quoteItemId,
        quoteId,
        quoteItems,
        productCategory: productCategory,
        items: [
          {
            name: productCategory.at(-1),
          },
        ],
      } as any);
    // 暴露form实例给父组件
    useImperativeHandle(ref, () => ({
      form,
    }));

    const updateModel = () => {
      const rawModel: string = form.getFieldValue("model") ?? "";
      const type = form.getFieldValue("type");
      const isCustomization = form.getFieldValue("isCustomization") === "定制";

      let baseModel = rawModel.replace("-NL", "").replace("（定制）", "");
      if (!baseModel) return form.setFieldsValue({ model: "" });

      if (type === "内冷式计量泵") baseModel += "-NL";
      if (isCustomization) baseModel += "（定制）";

      form.setFieldsValue({ model: baseModel });
    };

    const syncPumpInfo = () => {
      const model = form.getFieldValue("model");
      const shearSensitivity = form.getFieldValue("shearSensitivity");
      if (!model || !shearSensitivity) return;

      const selectedPump = pump.find(
        (p) =>
          p.shearSensitivity === shearSensitivity &&
          p.model === model.replace("-NL", "").replace("（定制）", "")
      );

      form.setFieldValue("pumpage", {
        front: selectedPump?.pumpage.replace("cm³/rev", ""),
        rear: NaN,
        value: selectedPump?.pumpage.replace("cm³/rev", ""),
        unit: "cm³/rev",
      });
      form.setFieldValue("heatingPower", {
        front: selectedPump?.heatingPower.replace("kw", ""),
        rear: NaN,
        value: selectedPump?.heatingPower.replace("kw", ""),
        unit: "kw",
      });
      form.setFieldValue("production", {
        front: selectedPump?.production.replace("kg/h", ""),
        value: selectedPump?.production.replace("kg/h", ""),
        rear: NaN,
        unit: "kg/h",
      });
      form.setFieldValue("rotateSpeed", {
        front: selectedPump?.rotateSpeed.replace("rmp", ""),
        rear: NaN,
        value: selectedPump?.rotateSpeed.replace("rmp", ""),
        unit: "rpm",
      });
    };

    const handlePumpBracket = async (value: boolean) => {
      if (value) {
        const result = await showProductActionModal(
          addProp(["模具配件", "计量泵支架"], "pumpBracket", false)
        );
        if (!result.result) form.setFieldValue("pumpBracket", false);
        return;
      }

      const result = await showProductActionModal(
        deleteProp(["模具配件", "计量泵支架"])
      );
      if (!result.result) form.setFieldValue("pumpBracket", true);
    };

    const handleOptionsChange = async (value: string[]) => {
      const prev = optionsRef.current;
      const handle = async (checked: boolean, prevChecked: boolean) => {
        if (checked && !prevChecked) {
          const result = await showProductActionModal(
            addProp(["熔体计量泵", "传动系统"], "options", prev)
          );
          if (!result.result) {
            form.setFieldValue("options", prev);
            return false;
          }
        } else if (!checked && prevChecked) {
          const result = await showProductActionModal(
            deleteProp(["熔体计量泵", "传动系统"])
          );
          if (!result.result) {
            form.setFieldValue("options", prev);
            return false;
          }
        }
        return true;
      };

      const trans = value.includes("传动系统");
      const prevTrans = prev.includes("传动系统");
      if (!(await handle(trans, prevTrans))) return;

      const control = value.includes("控制系统");
      const prevControl = prev.includes("控制系统");
      if (!(await handle(control, prevControl))) return;

      optionsRef.current = value;
    };

    const fieldHandlers: Record<string, (value: any) => void | Promise<void>> =
      {
        type: updateModel,
        isCustomization: updateModel,
        model: syncPumpInfo,
        shearSensitivity: syncPumpInfo,
        pumpBracket: handlePumpBracket,
        options: handleOptionsChange,
      };

    const handleFieldsChange = async (changedFields: any) => {
      for (const [key, value] of Object.entries(changedFields)) {
        const handler = fieldHandlers[key];
        if (handler) await handler(value);
      }
    };

    return (
      <>
        <TailForm
          layout={"vertical"}
          form={form}
          submitter={false}
          onValuesChange={handleFieldsChange}
        >
          <ModelSelection temperatureRequired={quoteType !== "history"} />
          <ModelOption />

          <Form.Item label="其他备注" name="remark">
            <TextArea />
          </Form.Item>
        </TailForm>
        {/* <FloatButton.BackTop visibilityHeight={0} /> */}
      </>
    );
  }
);

export default MeteringPumpForm;
const nearestOdd = (n: number): number => {
  const x = n / 200;
  const floor = Math.floor(x) | 1; // 向下取最近的奇数
  const ceil = Math.ceil(x) | 1; // 向上取最近的奇数
  return x - floor < ceil - x ? floor : ceil;
};
