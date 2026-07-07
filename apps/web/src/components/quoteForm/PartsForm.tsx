import {
  Col,
  Form,
  FormInstance,
  InputNumber,
  Row,
  Select,
  Typography,
} from "@/components/ui/core";
import TailForm, { TailFormList, TailFormDependency } from "@/components/ui/proForm";
import { forwardRef, useImperativeHandle } from "react";
import PartAutoComplete from "./formComponents/PartAutoComplete";
import { formatPrice } from "@/utils/value";

interface PartFormRef {
  form: FormInstance;
}

interface PartFormProps {
  readOnly?: boolean;
}

const PartForm = forwardRef<PartFormRef, PartFormProps>(
  ({ readOnly = false }, ref) => {
    const [form] = Form.useForm();


    useImperativeHandle(ref, () => ({
      form,
    }));

    return (
      <TailForm
        layout="vertical"
        form={form}
        submitter={false}
        readonly={readOnly}
      >
        <TailFormList
          name="parts"
          label="配件明细"
          creatorButtonProps={{ creatorButtonText: "新增物料" }}
          deleteIconProps={readOnly ? false : undefined}
          copyIconProps={readOnly ? false : undefined}
          alwaysShowItemLabel
          rules={[
            {
              required: true,
              message: "请至少输入一个配件",
              validator: (_, value) => {
                if (!value || value.length == 0) {
                  return Promise.reject(new Error("请至少输入一个配件"));
                }
                return Promise.resolve();
              },
            },
          ]}
        >
          {(f, index, action) => (
            <Row gutter={16}>
              <Col xs={24} md={8}>
                <TailForm.Item
                  name={"name"}
                  label="名称"
                  rules={[{ required: true, message: "请输入物料名称" }]}
                  readonly={readOnly}
                >
                  <PartAutoComplete form={form} index={index} />
                </TailForm.Item>
              </Col>
              <Col xs={12} md={3}>
                <TailForm.Item
                  name="quantity"
                  label="数量"
                  rules={[{ required: true, message: "请输入数量" }]}
                  initialValue={1}
                >
                  <InputNumber
                    min={1}
                    style={{ width: "100%" }}
                    controls={false}
                  />
                </TailForm.Item>
              </Col>
              <Col xs={12} md={3}>
                <TailForm.Item
                  name="unit"
                  label="单位"
                  rules={[{ required: true, message: "请选择单位" }]}
                  initialValue="件"
                >
                  <Select style={{ width: "100%" }}>
                    <Select.Option value="件">件</Select.Option>
                    <Select.Option value="套">套</Select.Option>
                    <Select.Option value="个">个</Select.Option>
                  </Select>
                </TailForm.Item>
              </Col>
              <Col xs={12} md={4}>
                <TailForm.Item
                  name="unitPrice"
                  label="单价"
                  rules={[{ required: true, message: "请输入单价" }]}
                >
                  <InputNumber
                    min={0}
                    precision={2}
                    controls={false}
                    style={{ width: "100%" }}
                  />
                </TailForm.Item>
              </Col>
              <Col xs={12} md={6}>
                <TailFormDependency name={["quantity", "unitPrice"]}>
                  {({ quantity, unitPrice }) => (
                    <Form.Item label="合计">
                      <Typography.Text strong>
                        {quantity && unitPrice
                          ? `¥ ${formatPrice(quantity * unitPrice)}`
                          : 0}
                      </Typography.Text>
                    </Form.Item>
                  )}
                </TailFormDependency>
              </Col>
            </Row>
          )}
        </TailFormList>
        <Form.Item shouldUpdate>
          {({ getFieldValue }) => {
            const parts = getFieldValue("parts") || [];
            const total = parts.reduce((sum: number, g: any) => {
              const q = g?.quantity;
              const p = g?.unitPrice;
              if (q && p) return sum + q * p;
              return sum;
            }, 0);
            return (
              <Typography.Text strong>
                总计：¥ {formatPrice(total || 0)}
              </Typography.Text>
            );
          }}
        </Form.Item>
      </TailForm>
    );
  }
);

export default PartForm;
