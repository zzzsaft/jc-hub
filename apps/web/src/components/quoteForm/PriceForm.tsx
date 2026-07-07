import {
  Col,
  Form,
  FormInstance,
  Input,
  InputNumber,
  Row,
  Select,
  Typography,
} from "@/components/ui/core";
import { forwardRef, useImperativeHandle } from "react";
import InputWithButton from "../general/InputWithButton";
import { formatPrice } from "@/utils/value";
interface PriceFormRef {
  form: FormInstance; // 明确定义暴露的form实例
}

interface PriceFormProps {
  onGenerateName?: () => string | undefined;
  readOnly?: boolean;
  showProductCode?: boolean;
}

const brandOption = [
  { value: "精诚", label: "精诚" },
  { value: "JC-TIMES", label: "JC-TIMES" },
  { value: "古迪", label: "古迪" },
];

const PriceForm = forwardRef<PriceFormRef, PriceFormProps>(
  ({ onGenerateName, readOnly = false, showProductCode = false }, ref) => {
    const [form] = Form.useForm();
    // 暴露form实例给父组件
    useImperativeHandle(ref, () => ({
      form,
    }));

    const handleGenerateName = () => {
      if (!onGenerateName) return;
      const name = onGenerateName();
      if (name) form.setFieldValue("productName", name);
    };
    // 计算小计

    const handleValuesChange = (changedValues: any, allValues: any) => {
      if ("unit" in changedValues || "quantity" in changedValues) {
        const { unit, quantity } = allValues;
        if (unit === "套" && quantity != null && quantity % 1 !== 0) {
          // 使用setTimeout避免循环
          setTimeout(
            () => form.setFieldValue("quantity", Math.round(quantity)),
            0
          );
        }
      }
    };

    return (
      <Form
        layout={"vertical"}
        // preserve={false}
        form={form}
        onValuesChange={handleValuesChange}
      >
        <Row gutter={20}>
          <Col xs={12} sm={12}>
            <Form.Item
              name="productName"
              label="产品名称"
              rules={[{ required: true, message: "请输入产品名称" }]}
            >
              <InputWithButton
                style={{ width: "100%" }}
                buttonText="自动生成名称"
                onButtonClick={handleGenerateName}
              />
            </Form.Item>
          </Col>

          {showProductCode && (
            <Col xs={12} sm={12}>
              <Form.Item
                name="productCode"
                label="产品编码"
                rules={[{ required: true, message: "请输入产品编码" }]}
              >
                <Input style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          )}

          <Col xs={12} sm={12}>
            <Form.Item
              name="brand"
              label="品牌"
              rules={[{ required: true, message: "请选择品牌" }]}
            >
              <Select options={brandOption} style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col xs={12} sm={12}>
            <Form.Item
              shouldUpdate={(pre, cur) => pre.unit != cur.unit}
              noStyle
            >
              {({ getFieldValue }) => {
                const unit = getFieldValue("unit") || "套"; // 默认单位是 '套'
                return (
                  <Form.Item
                    name="quantity"
                    label="数量"
                    rules={[
                      { required: true, message: "请输入数量" },
                      {
                        validator: (_, value: number) => {
                          // 1. 首先检查是否选择了选项
                          if (value < 1) {
                            return Promise.reject(new Error("数量应大于0"));
                          }
                          return Promise.resolve();
                        },
                      },
                    ]}
                  >
                    <InputNumber
                      min={unit === "套" ? 1 : 0.01}
                      precision={unit === "套" ? 0 : 2}
                      style={{ width: "100%" }}
                      addonAfter={
                        <Form.Item
                          name="unit"
                          noStyle
                          initialValue="套"
                          rules={[{ required: true, message: "请输入单位" }]}
                        >
                          <Select style={{ width: 80 }} placeholder="单位">
                            <Select.Option value="套">套</Select.Option>
                            <Select.Option value="米">米</Select.Option>
                            <Select.Option value="千克">千克</Select.Option>
                          </Select>
                        </Form.Item>
                      }
                    />
                  </Form.Item>
                );
              }}
            </Form.Item>
          </Col>
          <Col xs={12} sm={12}>
            <Form.Item
              name="unitPrice"
              label="单价"
              rules={[{ required: true, message: "请输入单价" }]}
            >
              <InputNumber
                min={0}
                precision={2}
                style={{ width: "100%" }}
                formatter={(value) => `${formatPrice(Number(value), 0, 2)}`}
              />
            </Form.Item>
          </Col>
          <Col xs={12} sm={12}>
            <Form.Item name="discountRate" label="折扣率(%)" initialValue={100}>
              <InputNumber
                min={0}
                max={100}
                precision={2}
                style={{ width: "100%" }}
                placeholder="0-100"
                formatter={(value) => `${value}%`}
              />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item
          label="小计金额"
          dependencies={["quantity", "unitPrice", "discountRate", "unit"]}
        >
          {({ getFieldValue }) => {
            const unitPrice = getFieldValue("unitPrice");
            const unit = getFieldValue("unit");
            const discountRate = getFieldValue("discountRate") || 0;
            const quantity =
              unit == "套"
                ? Math.round(getFieldValue("quantity"))
                : getFieldValue("quantity");

            const subtotal =
              quantity && unitPrice
                ? (quantity * unitPrice * (discountRate / 100)).toFixed(2)
                : null;

            return (
              <Typography.Text strong>
                {subtotal ? `${formatPrice(Number(subtotal), 0, 2)}` : 0}
              </Typography.Text>
            );
          }}
        </Form.Item>
      </Form>
    );
  }
);

export default PriceForm;
