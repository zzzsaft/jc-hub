import { Form, FormInstance } from "@/components/ui/core";
import { forwardRef, useImperativeHandle, useState } from "react";
import TextArea from "@/components/ui/TextArea";
interface OtherFormRef {
  form: FormInstance; // 明确定义暴露的form实例
}

export const OtherForm = forwardRef<
  OtherFormRef,
  { readOnly?: boolean }
>(({ readOnly = false }, ref) => {
  const [form] = Form.useForm();

  // 暴露form实例给父组件
  useImperativeHandle(ref, () => ({
    form,
  }));
  // 计算小计``

  return (
    <Form layout={"vertical"} form={form}>
      <Form.Item
        name="remark"
        label="规格型号"
        // rules={[{ required: true, message: "请输入规格型号" }]}
      >
        <TextArea rows={10} placeholder="请输入规格型号" />
      </Form.Item>
    </Form>
  );
});
