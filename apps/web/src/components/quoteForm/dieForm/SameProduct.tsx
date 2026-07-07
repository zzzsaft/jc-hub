import { Button, Col, Form, Input, Row } from "@/components/ui/core";
import { useState } from "react";
import ImportProductModal from "@/components/quote/productConfigForm/ImportProductModal";

interface SameProductProps {
  quoteId: number;
  quoteItemId: number;
  onLockChange?: (locked: boolean) => void;
}

export const SameProduct: React.FC<SameProductProps> = ({
  quoteId,
  quoteItemId,
  onLockChange,
}) => {
  const form = Form.useFormInstance();
  const [sameOpen, setSameOpen] = useState(false);
  const [interOpen, setInterOpen] = useState(false);
  const [sameSelected, setSameSelected] = useState(false);
  const [interSelected, setInterSelected] = useState(false);

  const handleSameSelect = (item: any) => {
    if (item?.config) {
      const {
        isBuySameProduct,
        lastProductCode,
        isIntercompatible,
        intercompatibleProductCode,
        ...rest
      } = item.config as any;
      form.setFieldsValue(rest);
    }
    form.setFieldsValue({
      isBuySameProduct: true,
      lastProductCode: item.productCode,
    });
    setSameSelected(true);
    setSameOpen(false);
    onLockChange?.(true);
  };

  const handleInterSelect = (item: any) => {
    form.setFieldsValue({
      isIntercompatible: true,
      intercompatibleProductCode: item.productCode,
    });
    setInterSelected(true);
    setInterOpen(false);
  };

  return (
    <>
      <Row gutter={16} style={{ position: "relative", zIndex: 20 }}>
        <Col xs={12} md={8}>
          <Form.Item
            label="是否购买过相同型号产品"
            colon={false}
            style={{ marginBottom: 0 }}
          >
            <Button
              disabled={false}
              danger={sameSelected}
              type={sameSelected ? "primary" : "default"}
              title={sameSelected ? "取消相同产品" : "选择相同产品编号"}
              onClick={() => {
                if (sameSelected) {
                  form.setFieldsValue({
                    isBuySameProduct: false,
                    lastProductCode: undefined,
                  });
                  setSameSelected(false);
                  onLockChange?.(false);
                } else {
                  setSameOpen(true);
                }
              }}
            >
              {sameSelected ? "取消相同产品" : "选择相同产品编号"}
            </Button>
          </Form.Item>
        </Col>
        {sameSelected && (
          <Col xs={12} md={8}>
            <Form.Item
              name="lastProductCode"
              label="同型号产品编号"
              rules={[{ required: true, message: "请输入原产品名称编号" }]}
            >
              <Input disabled />
            </Form.Item>
          </Col>
        )}
        {!sameSelected && (
          <Col xs={12} md={8}>
            <Form.Item
              label="是否与购买过的产品互配"
              colon={false}
              style={{ marginBottom: 0 }}
            >
              <Button
                danger={interSelected}
                type={interSelected ? "primary" : "default"}
                title={interSelected ? "取消互配产品" : "选择互配产品编号"}
                onClick={() => {
                  if (interSelected) {
                    form.setFieldsValue({
                      isIntercompatible: false,
                      intercompatibleProductCode: undefined,
                    });
                    setInterSelected(false);
                  } else {
                    setInterOpen(true);
                  }
                }}
              >
                {interSelected ? "取消互配产品" : "选择互配产品编号"}
              </Button>
            </Form.Item>
          </Col>
        )}
        {!sameSelected && interSelected && (
          <Col xs={12} md={8}>
            <Form.Item
              name="intercompatibleProductCode"
              label="互配产品编号"
              rules={[{ required: true, message: "请输入原产品名称编号" }]}
            >
              <Input disabled />
            </Form.Item>
          </Col>
        )}
      </Row>
      <ImportProductModal
        open={sameOpen}
        onCancel={() => setSameOpen(false)}
        onImport={handleSameSelect}
        formType="DieForm"
        orderOnly
      />
      <ImportProductModal
        open={interOpen}
        onCancel={() => setInterOpen(false)}
        onImport={handleInterSelect}
        formType="DieForm"
        orderOnly
      />
    </>
  );
};

export default SameProduct;
