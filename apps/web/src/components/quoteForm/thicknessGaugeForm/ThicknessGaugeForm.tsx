import { Col, Form, Radio, Row, Segmented, Select } from "@/components/ui/core";
import TailForm from "@/components/ui/proForm";
import { forwardRef, useImperativeHandle } from "react";

const models = ["WLV5", "ULO3"];
const types = ["手动", "自动"];
const widths = [500, 1000, 1500, 2000, 2500, 3000, 3500];

const ThicknessGaugeForm = forwardRef<
  any,
  { quoteId: number; quoteItemId: number; readOnly?: boolean }
>(({ readOnly = false }, ref) => {
  const [form] = Form.useForm();

  useImperativeHandle(ref, () => ({
    form,
  }));

  const handleValuesChange = (changed: any) => {
    if (changed.model) {
      const model = changed.model;
      if (model === "WLV5") {
        if (form.getFieldValue("operation") === "自动") {
          form.setFieldValue("operation", "手动");
        }
        const w = form.getFieldValue("width");
        if (w === 3500) {
          form.setFieldValue("width", undefined);
        }
        if (form.getFieldValue("robotControlBox")) {
          form.setFieldValue("robotControlBox", false);
        }
        if (form.getFieldValue("boltControlBox")) {
          form.setFieldValue("boltControlBox", false);
        }
      }
    }
  };

  return (
    <TailForm
      layout="vertical"
      form={form}
      submitter={false}
      onValuesChange={handleValuesChange}
    >
      <Row gutter={16}>
        <Col xs={12} md={6}>
          <Form.Item
            name="model"
            label="型号"
            rules={[{ required: true, message: "请选择型号" }]}
            initialValue="WLV5"
          >
            <Segmented options={models} />
          </Form.Item>
        </Col>
        <Form.Item noStyle dependencies={["model"]}>
          {({ getFieldValue }) => (
            <Col xs={12} md={6}>
              <Form.Item
                name="operation"
                label="控制方式"
                rules={[{ required: true, message: "请选择控制方式" }]}
                initialValue="手动"
              >
                <Segmented
                  options={getFieldValue("model") === "ULO3" ? types : ["手动"]}
                />
              </Form.Item>
            </Col>
          )}
        </Form.Item>
        <Form.Item noStyle dependencies={["model"]}>
          {({ getFieldValue }) => {
            const model = getFieldValue("model");
            const opts = widths
              .filter((w) => model === "ULO3" || w <= 3000)
              .map((w) => ({ label: w.toString(), value: w }));
            return (
              <Col xs={12} md={6}>
                <Form.Item
                  name="width"
                  label="适用宽度(mm)"
                  rules={[{ required: true, message: "请选择适用宽度" }]}
                >
                  <Select options={opts} />
                </Form.Item>
              </Col>
            );
          }}
        </Form.Item>
        <Form.Item noStyle dependencies={["model"]}>
          {({ getFieldValue }) => (
            <>
              <Col xs={12} md={6}>
                <Form.Item
                  name="robotControlBox"
                  label="选配机械臂控制盒"
                  rules={[{ required: true, message: "是否选配机械臂控制盒" }]}
                  initialValue={false}
                >
                  <Radio.Group>
                    <Radio
                      value={true}
                      disabled={getFieldValue("model") !== "ULO3"}
                    >
                      是
                    </Radio>
                    <Radio value={false}>否</Radio>
                  </Radio.Group>
                </Form.Item>
              </Col>
              <Col xs={12} md={6}>
                <Form.Item
                  name="boltControlBox"
                  label="选配全马达螺栓控制盒"
                  rules={[
                    { required: true, message: "是否选配全马达螺栓控制盒" },
                  ]}
                  initialValue={false}
                >
                  <Radio.Group>
                    <Radio
                      value={true}
                      disabled={getFieldValue("model") !== "ULO3"}
                    >
                      是
                    </Radio>
                    <Radio value={false}>否</Radio>
                  </Radio.Group>
                </Form.Item>
              </Col>
            </>
          )}
        </Form.Item>
      </Row>
    </TailForm>
  );
});

export default ThicknessGaugeForm;
