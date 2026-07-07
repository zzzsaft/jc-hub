import { Form, FormInstance } from "@/components/ui/core";
import { forwardRef, useImperativeHandle, useState } from "react";
import { Product } from "./Product";
import { DieBody } from "./DieBody";
import { DieInstall } from "./DieInstall";
import { TemperatureControl } from "./TemperatureControl";
import { SurfaceTreatment } from "./SurfaceTreatment";
import { SameProduct } from "./SameProduct";
import TailForm from "@/components/ui/proForm";
import TextArea from "@/components/ui/TextArea";
import useProductActionModal from "@/hooks/showProductActionModal";
import { useQuoteStore } from "@/store/useQuoteStore";
interface PriceFormRef {
  form: FormInstance; // 明确定义暴露的form实例
}

const DieForm = forwardRef(
  (
    {
      quoteId,
      quoteItemId,
      readOnly = false,
    }: { quoteId: number; quoteItemId: number; readOnly?: boolean },
    ref
  ) => {
    const [form] = Form.useForm();
    const [locked, setLocked] = useState(false);
    const quoteItems = useQuoteStore
      .getState()
      .quotes.find((quote) => quote.id === quoteId)?.items;
    const category = quoteItems?.find(
      (i) => i.id === quoteItemId
    )?.productCategory;
    const isHollow = category?.some((c) => c.includes("中空"));
    const { showProductActionModal } = useProductActionModal();

    // 暴露form实例给父组件
    useImperativeHandle(ref, () => ({
      form,
    }));

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

    const deleteProp: any = (productCategory: string[]) => ({
      method: "delete",
      linkId: quoteItemId,
      quoteId,
      quoteItems,
      productCategory,
      items: [
        {
          name: productCategory.at(-1),
        },
      ],
    });

    const handleDieWidth = (value: any) => {
      const width = Number(value.front);
      const zone = nearestOdd(width);
      form.setFieldValue("heatingZones", zone);
      form.setFieldValue("powerCableLength", width <= 1500 ? 3 : 5);
      form.setFieldValue("glassHeatingZones", zone);
    };

    const handleHeatingZones = (value: number) => {
      form.setFieldValue("glassHeatingZones", value);
    };

    const handleCompositeStructure = (value: string) => {
      const list = value.split("").map((s: any) => ({ layer: s }));
      form.setFieldValue("screwList", list);
    };

    const handleRunnerNumber = (value: number) => {
      const ratioList = (form.getFieldValue("runnerLayers") || []) as any[];
      const base = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      const len = value;
      const ratioNext = Array.from({ length: len }, (_, i) => ({
        level: base[i],
      }));
      form.setFieldValue(
        "runnerLayers",
        ratioList.slice(0, len).concat(ratioNext.slice(ratioList.length))
      );
    };

    const handleHasCart = async (value: string) => {
      if (value === "有") {
        const result = await showProductActionModal(
          addProp(["模具配件", "模具拆装小车"], "hasCart", "无")
        );
        if (!result.result) form.setFieldValue("hasCart", "无");
        return;
      }

      const result = await showProductActionModal(
        deleteProp(["模具配件", "模具拆装小车"])
      );
      if (!result.result) form.setFieldValue("hasCart", "有");
    };

    const handleSmartRegulator = async (value: boolean) => {
      if (value) {
        const result = await showProductActionModal(
          addProp(["模具配件", "智能调节器"], "smartRegulator", false)
        );
        if (!result.result) form.setFieldValue("smartRegulator", false);
        return;
      }

      const result = await showProductActionModal(
        deleteProp(["模具配件", "智能调节器"])
      );
      if (!result.result) form.setFieldValue("smartRegulator", true);
    };

    const handleThermalInsulation = async (value: boolean) => {
      if (value) {
        const result = await showProductActionModal(
          addProp(["模具配件", "隔热装置"], "haveThermalInsulation", false)
        );
        if (!result.result) form.setFieldValue("haveThermalInsulation", false);
        return;
      }

      const result = await showProductActionModal(
        deleteProp(["模具配件", "隔热装置"])
      );
      if (!result.result) form.setFieldValue("haveThermalInsulation", true);
    };

    const handleThicknessGauge = async (value: boolean) => {
      if (value) {
        const result = await showProductActionModal(
          addProp(["测厚仪"], "thicknessGauge", false)
        );
        if (!result.result) form.setFieldValue("thicknessGauge", false);
        return;
      }

      const result = await showProductActionModal(deleteProp(["测厚仪"]));
      if (!result.result) form.setFieldValue("thicknessGauge", true);
    };

    const handleHasManifold = async (value: boolean) => {
      if (value) {
        const result = await showProductActionModal(
          addProp(["配套件", "合流器"], "hasManifold", false)
        );
        if (!result.result) form.setFieldValue("hasManifold", false);
        return;
      }

      const result = await showProductActionModal(deleteProp(["合流器"]));
      if (!result.result) form.setFieldValue("hasManifold", true);
    };

    const handleLowerLipStructure = (value: string) => {
      if (value?.includes("整体")) {
        form.setFieldValue("lipCount", 1);
        handleLipCount(1);
      }
    };

    const handleLipCount = (value: number) => {
      const count = value ?? 1;
      if (count <= 1) {
        form.setFieldValue("lipThicknessRange", []);
        return;
      }
      const list = (form.getFieldValue("lipThicknessRange") || []) as any[];
      const next = Array.from({ length: count }, () => ({}));
      form.setFieldValue(
        "lipThicknessRange",
        list.slice(0, count).concat(next.slice(list.length))
      );
    };

    const fieldHandlers: Record<string, (value: any) => void | Promise<void>> =
      {
        dieWidth: handleDieWidth,
        heatingZones: handleHeatingZones,
        compositeStructure: handleCompositeStructure,
        runnerNumber: handleRunnerNumber,
        hasCart: handleHasCart,
        smartRegulator: handleSmartRegulator,
        haveThermalInsulation: handleThermalInsulation,
        thicknessGauge: handleThicknessGauge,
        hasManifold: handleHasManifold,
        lowerLipStructure: handleLowerLipStructure,
        lipCount: handleLipCount,
      };

    const handleFieldsChange = async (changedFields: any) => {
      for (const [key, value] of Object.entries(changedFields)) {
        const handler = fieldHandlers[key];
        if (handler) await handler(value);
      }
    };

    return (
      <div style={{ position: "relative" }}>
        <TailForm
          layout={"vertical"}
          form={form}
          submitter={false}
          onValuesChange={handleFieldsChange}
          disabled={locked}
        >
          <SameProduct
            quoteId={quoteId}
            quoteItemId={quoteItemId}
            onLockChange={setLocked}
          />

          <Product />
          <DieBody isHollow={!!isHollow} />
          <DieInstall />
          <TemperatureControl />
          <SurfaceTreatment />

          <Form.Item label="其他备注" name="remark">
            <TextArea />
          </Form.Item>
        </TailForm>
        {locked && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 10,
              background: "rgba(255,255,255,0.4)",
            }}
          />
        )}
        {/* <FloatButton.BackTop visibilityHeight={0} /> */}
      </div>
    );
  }
);

export default DieForm;
const nearestOdd = (n: number): number => {
  const x = n / 200;
  const floor = Math.floor(x) | 1; // 向下取最近的奇数
  const ceil = Math.ceil(x) | 1; // 向上取最近的奇数
  return x - floor < ceil - x ? floor : ceil;
};
