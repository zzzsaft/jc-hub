import { Col, Form, Input, InputNumber, Radio, Row, AutoComplete, Select } from "@/components/ui/core";
import { IntervalInputFormItem } from "@/components/general/IntervalInput";

const PROCESS_OPTIONS = [
  "锂电池涂布",
  "氢能涂布",
  "热熔胶涂布",
  "陶瓷电容涂布",
  "水处理膜涂布",
  "钙钛矿涂布",
  "半导体涂布",
].map((v) => ({ label: v, value: v }));

const MICRO_ADJUST = [
  { label: "垫片调节", value: "垫片调节" },
  { label: "差动调节", value: "差动调节" },
];

const INSTALL_OPTIONS = [
  { value: "水平" },
  { value: "垂直" },
];

export default function BasicInfo() {
  return (
    <>
      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Form.Item label="涂布工艺名称" name="processName" rules={[{ required: true, message: "请选择涂布工艺" }]}> 
            <Select options={PROCESS_OPTIONS} />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item label="涂布液名称" name="liquidName" rules={[{ required: true, message: "请输入涂布液名称" }]}> 
            <Input />
          </Form.Item>
        </Col>
        <Col xs={12} md={6}>
          <Form.Item label="涂布层数" name="layerCount" initialValue={1}> 
            <InputNumber min={1} style={{ width: "100%" }} />
          </Form.Item>
        </Col>
        <Col xs={12} md={6}>
          <IntervalInputFormItem label="模头有效涂布宽度" name="effectiveWidth" unit="mm" />
        </Col>
        <Col xs={12} md={6}>
          <Form.Item label="模唇微调方式" name="microAdjust" rules={[{ required: true, message: "请选择方式" }]}> 
            <Radio.Group options={MICRO_ADJUST} optionType="button" />
          </Form.Item>
        </Col>
        <Col xs={12} md={6}>
          <Form.Item label="涂布模头安装方式" name="installMethod"> 
            <AutoComplete options={INSTALL_OPTIONS} />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item label="涂布模头安装孔位置" name="installHole"> 
            <Input />
          </Form.Item>
        </Col>
      </Row>
    </>
  );
}
