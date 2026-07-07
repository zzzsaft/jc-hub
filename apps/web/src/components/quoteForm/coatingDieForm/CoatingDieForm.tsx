import { forwardRef, useImperativeHandle } from "react";
import { Form, FormInstance } from "@/components/ui/core";
import TailForm from "@/components/ui/proForm";
import BasicInfo from "./BasicInfo";
import LiquidInfo from "./LiquidInfo";
import ProcessInfo from "./ProcessInfo";

export interface CoatingDieFormRef {
  form: FormInstance;
}

const CoatingDieForm = forwardRef<CoatingDieFormRef, { quoteId: number; quoteItemId: number; readOnly?: boolean }>(
  ({ readOnly = false }, ref) => {
    const [form] = Form.useForm();

    useImperativeHandle(ref, () => ({
      form,
    }));

    return (
      <TailForm layout="vertical" form={form} submitter={false}>
        <BasicInfo />
        <LiquidInfo />
        <ProcessInfo />
      </TailForm>
    );
  }
);

export default CoatingDieForm;
