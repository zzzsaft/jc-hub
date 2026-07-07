import { Col, Form, FormInstance, Input, Radio, Row } from "@/components/ui/core";
import { forwardRef, useImperativeHandle, useState } from "react";
import useProductActionModal from "@/hooks/showProductActionModal";
import { useQuoteStore } from "@/store/useQuoteStore";

import TextArea from "@/components/ui/TextArea";
import TailForm from "@/components/ui/proForm";
import CustomRadioGroup from "../general/CustomRadioGroup";
import { TooltipLabel } from "../general/TooltipLabel";
import { RadioWithInputRules } from "@/utils/rules";
interface PriceFormRef {
  form: FormInstance; // 明确定义暴露的form实例
}

// 常量定义
const torque = [
  { label: "小扭矩", value: "小扭矩" },
  { label: "大扭矩", value: "大扭矩" },
];

const operator = [
  { label: "单机头", value: "单机头" },
  { label: "双机头", value: "双机头" },
];

const vison = [
  { label: "含视觉", value: "含视觉" },
  { label: "不含视觉", value: "不含视觉" },
];

const SmartRegulator = forwardRef<
  PriceFormRef,
  { quoteId: number; quoteItemId: number; readOnly?: boolean }
>(({ quoteId, quoteItemId, readOnly = false }, ref) => {
  const [form] = Form.useForm();
  const [isBundled] = useState<boolean>(true);
  const quoteItems = useQuoteStore
    .getState()
    .quotes.find((q) => q.id === quoteId)?.items;
  const { showProductActionModal } = useProductActionModal();

  // 暴露form实例给父组件
  useImperativeHandle(ref, () => ({
    form,
  }));

  const addProp: any = (category: string[], key: string, value: any) => ({
    method: "add",
    quoteId,
    quoteItems,
    productCategory: category,
    productName: category.at(-1) ?? "",
    linkId: quoteItemId,
    source: {
      name: category.at(-1) ?? "",
      value,
      key,
    },
  });

  const deleteProp: any = (category: string[]) => ({
    method: "delete",
    linkId: quoteItemId,
    quoteId,
    quoteItems,
    productCategory: category,
    items: [{ name: category.at(-1) ?? "" }],
  });

  const handleThicknessGauge = async (v: boolean) => {
    if (v) {
      const r = await showProductActionModal(
        addProp(["测厚仪"], "thicknessGauge", false)
      );
      if (!r.result) form.setFieldValue("thicknessGauge", false);
      return;
    }
    const r = await showProductActionModal(deleteProp(["测厚仪"]));
    if (!r.result) form.setFieldValue("thicknessGauge", true);
  };

  const handleValuesChange = async (changed: any) => {
    if (changed.thicknessGauge != null) await handleThicknessGauge(changed.thicknessGauge);
  };

  return (
    <>
      <TailForm
        layout={"vertical"}
        form={form}
        submitter={false}
        onValuesChange={handleValuesChange}
      >
        <Row gutter={16}>
          <Col xs={12} md={8}>
            <Form.Item
              name="isBundled"
              label="是否配套新产品"
              rules={[{ required: true, message: "是否配套新产品" }]}
              initialValue={false}
            >
              <Radio.Group disabled>
                <Radio value={true}>是</Radio>
                <Radio value={false}>否</Radio>
              </Radio.Group>
            </Form.Item>
          </Col>
          {form.getFieldValue("isBundled") == false && (
            <Col xs={12} md={8}>
              <Form.Item
                name="lastProductCode"
                label="原产品编号"
                rules={[{ required: true, message: "请输入原产品名称编号" }]}
              >
                <Input />
              </Form.Item>
            </Col>
          )}

          <Col xs={24} sm={12}>
            <Form.Item label="扭矩" name="torque" rules={RadioWithInputRules}>
              <CustomRadioGroup options={torque} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item
              rules={RadioWithInputRules}
              label={
                <TooltipLabel
                  label="机头"
                  tooltip={`长度在2500及以下的，建议选“单”机头\n长度在2500以上的，建议选“双”机头`}
                />
              }
              name="operator"
            >
              <CustomRadioGroup options={operator} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item label="视觉" name="vison" rules={RadioWithInputRules}>
              <CustomRadioGroup options={vison} showCustomInput={false} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item
              label="是否选配测厚仪"
              name="thicknessGauge"
              rules={[{ required: true, message: "是否选配测厚仪" }]}
              initialValue={false}
            >
              <Radio.Group>
                <Radio value={true}>是</Radio>
                <Radio value={false}>否</Radio>
              </Radio.Group>
            </Form.Item>
          </Col>
          <Col xs={24} sm={24}>
            <Form.Item label="其他备注" name="remark">
              <TextArea rows={3} />
            </Form.Item>
          </Col>
        </Row>
      </TailForm>
      {/* <FloatButton.BackTop visibilityHeight={0} /> */}
    </>
  );
});

export default SmartRegulator;
