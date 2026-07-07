import { AutoCompleteInput } from "@/components/general/AutoCompleteInput";
import TailForm from "@/components/ui/proForm";
import { Row, Col, InputNumber, Layout } from "@/components/ui/core";

const MeshBeltSpecItem: React.FC = () => {
  return (
    <Row gutter={16}>
      <Col xs={12} md={6}>
        <TailForm.Item
          name="mesh"
          label="目"
          rules={[{ required: true, message: "请输入目数" }]}
          initialValue={120}
          layout="vertical"
        >
          <AutoCompleteInput
            options={[80, 120, 150].map((n) => ({
              label: String(n),
              value: String(n),
            }))}
          />
        </TailForm.Item>
      </Col>
      <Col xs={12} md={6}>
        <TailForm.Item
          name="length"
          label="长度"
          rules={[{ required: true, message: "请输入长度" }]}
          initialValue={10}
          layout="vertical"
        >
          <AutoCompleteInput addonAfter="米" />
        </TailForm.Item>
      </Col>
      <Col xs={12} md={6}>
        <TailForm.Item
          name="width"
          label="宽度"
          rules={[{ required: true, message: "请输入宽度" }]}
          layout="vertical"
        >
          <AutoCompleteInput addonAfter="mm" />
        </TailForm.Item>
      </Col>
      <Col xs={12} md={6}>
        <TailForm.Item
          name="quantity"
          label="数量"
          rules={[{ required: true, message: "请输入数量" }]}
          initialValue={1}
          layout="vertical"
        >
          <InputNumber min={1} addonAfter="卷" style={{ width: "100%" }} />
        </TailForm.Item>
      </Col>
    </Row>
  );
};

export default MeshBeltSpecItem;
