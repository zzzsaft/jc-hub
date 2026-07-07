import { Col, Form, Input, InputNumber, Radio, Row, Select, Segmented } from "@/components/ui/core";
import { IntervalInputFormItem } from "@/components/general/IntervalInput";

const LIQUID_PROPERTIES = ["腐蚀性", "磨蚀性", "毒性", "粘性", "易结晶", "易沉淀"].map(v => ({label:v,value:v}));
const LIQUID_FEATURES = ["水状", "蜂蜜状", "乳胶状", "砂浆状", "粘土浆状"].map(v=>({label:v,value:v}));

export default function LiquidInfo() {
  return (
    <>
      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Form.Item label="涂布液体类型和化学元素" name="liquidType">
            <Input />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item label="涂布液特性" name="liquidProperty">
            <Select mode="tags" options={LIQUID_PROPERTIES} />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item label="涂布液特征" name="liquidFeature">
            <Select mode="tags" options={LIQUID_FEATURES} />
          </Form.Item>
        </Col>
        <Col xs={12} md={6}>
          <Form.Item label="涂布液体ph值" name="liquidPh">
            <InputNumber min={0} max={14} step={0.1} style={{ width: "100%" }} />
          </Form.Item>
        </Col>
        <Col xs={12} md={6}>
          <IntervalInputFormItem label="涂布液密度" name="liquidDensity" unit="g/cm³" />
        </Col>
        <Col xs={12} md={6}>
          <Form.Item label="涂布液性质" name="liquidNature">
            <Segmented options={["牛顿流体", "非牛顿流体"]} />
          </Form.Item>
        </Col>
        <Col xs={12} md={6}>
          <IntervalInputFormItem label="涂布液正常粘度范围" name="liquidViscosity" unit="cps" />
        </Col>
        <Col xs={12} md={6}>
          <IntervalInputFormItem label="工艺温度" name="processTemp" initialValue={{ value: "15~25", front: 15, rear: 25, unit: "℃" }} unit="℃" />
        </Col>
        <Col xs={12} md={6}>
          <Form.Item label="热电偶孔" name="thermocouple" initialValue={"有"}>
            <Radio.Group>
              <Radio value="有">有</Radio>
              <Radio value="无">无</Radio>
            </Radio.Group>
          </Form.Item>
        </Col>
        <Col xs={12} md={6}>
          <IntervalInputFormItem label="线速度" name="lineSpeed" unit="mm/s" />
        </Col>
        <Col xs={12} md={6}>
          <IntervalInputFormItem label="固含量" name="solidContent" unit="%" />
        </Col>
        <Col xs={12} md={6}>
          <Form.Item label="是否存在颗粒" name="hasParticle" initialValue="无">
            <Radio.Group>
              <Radio value="有">有</Radio>
              <Radio value="无">无</Radio>
            </Radio.Group>
          </Form.Item>
        </Col>
        <Form.Item noStyle dependencies={["hasParticle"]}>
          {({ getFieldValue }) => {
            return getFieldValue("hasParticle") === "有" ? (
              <Col xs={12} md={6}>
                <IntervalInputFormItem label="颗粒大小" name="particleSize" unit="μm" />
              </Col>
            ) : null;
          }}
        </Form.Item>
      </Row>
    </>
  );
}
