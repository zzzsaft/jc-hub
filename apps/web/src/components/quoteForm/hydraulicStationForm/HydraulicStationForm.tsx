import {
  Col,
  Form,
  FormInstance,
  InputNumber,
  Row,
  Segmented,
  Typography,
} from "@/components/ui/core";
import { forwardRef, useImperativeHandle, useEffect } from "react";
import TailForm from "@/components/ui/proForm";
import { PowerInput } from "../formComponents/PowerInput";
import { useQuoteStore } from "@/store/useQuoteStore";

interface HydraulicStationFormProps {
  quoteId: number;
  quoteItemId: number;
  readOnly?: boolean;
}

const HydraulicStationForm = forwardRef(
  (
    {
      quoteId,
      quoteItemId,
      readOnly = false,
    }: HydraulicStationFormProps & { readOnly?: boolean },
    ref
  ) => {
    const [form] = Form.useForm();

    useImperativeHandle(ref, () => ({
      form,
    }));

    const valveCountMap: Record<string, number> = {
      单: 1,
      一: 1,
      双: 2,
      二: 2,
      三: 3,
      四: 4,
      五: 5,
      六: 6,
    };

    const updatePipeQuantity = (valve: string) => {
      const count = valveCountMap[valve];
      if (!count) return;
      const quantity = count * 2;
      form.setFieldValue("pipeQuantity", quantity);
    };

    const handleFieldsChange = (changedFields: any) => {
      if (changedFields.valveShare != null) {
        updatePipeQuantity(changedFields.valveShare);
      }
    };

    useEffect(() => {
      updatePipeQuantity(form.getFieldValue("valveShare"));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const quoteItems =
      useQuoteStore.getState().quotes.find((q) => q.id === quoteId)?.items ??
      [];
    const findItemById = useQuoteStore.getState().findItemById;
    const currentItem = findItemById(quoteItems, quoteItemId);
    const linkedName = currentItem?.linkId
      ? findItemById(quoteItems, currentItem.linkId)?.productName
      : undefined;

    return (
      <TailForm
        layout="vertical"
        form={form}
        submitter={false}
        onValuesChange={handleFieldsChange}
      >
        {linkedName && (
          <Typography.Text
            type="secondary"
            style={{ display: "block", marginBottom: 16 }}
          >
            关联产品：{linkedName}
          </Typography.Text>
        )}
        <Row gutter={16}>
          <Col xs={12} md={6}>
            <Form.Item
              label="油泵配置"
              name="pumpConfig"
              initialValue="含油泵"
              rules={[{ required: true, message: "请选择油泵配置" }]}
            >
              <Segmented options={["含油泵", "不含油泵"]} />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item
              label="蓄能器配置"
              name="accumulatorConfig"
              initialValue="含蓄能器"
              rules={[{ required: true, message: "请选择蓄能器配置" }]}
            >
              <Segmented options={["含蓄能器", "不含蓄能器"]} />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item
              label="规格"
              name="spec"
              initialValue="电磁阀"
              rules={[{ required: true, message: "请选择规格" }]}
            >
              <Segmented options={["电磁阀", "手动阀"]} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              label="阀共享数量"
              name="valveShare"
              initialValue="一"
              rules={[{ required: true, message: "请选择共享阀数量" }]}
            >
              <Segmented options={["单", "双", "三", "四", "五", "六"]} />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item
              label="电机电压"
              name="powerInput"
              rules={[{ required: true, message: "请输入电机电压" }]}
            >
              <PowerInput />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item
              label="功率"
              name="power"
              // rules={[{ required: true, message: "请输入功率" }]}
            >
              <InputNumber
                style={{ width: "100%" }}
                formatter={(v) => (v ? `${v}kw` : "")}
                parser={(v) => v?.replace(/kw/g, "") as any}
              />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col xs={12} md={6}>
            <Form.Item
              label="油管长度"
              name="pipeLength"
              rules={[{ required: true, message: "请输入油管长度" }]}
            >
              <InputNumber
                style={{ width: "100%" }}
                min={0}
                formatter={(v) => (v ? `${v}米` : "")}
                parser={(v) => v?.replace(/米/g, "") as any}
              />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item
              label="油管数量"
              name="pipeQuantity"
              rules={[{ required: true, message: "请输入油管数量" }]}
            >
              <InputNumber
                style={{ width: "100%" }}
                min={0}
                formatter={(v) => (v ? `${v}条` : "")}
                parser={(v) => v?.replace(/条/g, "") as any}
              />
            </Form.Item>
          </Col>
        </Row>
      </TailForm>
    );
  }
);

export default HydraulicStationForm;
