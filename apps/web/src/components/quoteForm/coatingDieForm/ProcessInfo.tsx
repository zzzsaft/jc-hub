import {
  Col,
  Form,
  Input,
  InputNumber,
  Radio,
  Row,
  AutoComplete,
  Select,
} from "@/components/ui/core";
import TextArea from "@/components/ui/TextArea";
import { IntervalInputFormItem } from "@/components/general/IntervalInput";
import MaterialSelect from "@/components/general/MaterialSelect";
import { CustomSelect } from "@/components/general/CustomSelect";
import { MATERIAL_OPTIONS } from "@/utils/material";

const YIELD_UNITS = ["kg/h", "ml/min"].map((v) => ({ label: v, value: v }));

export default function ProcessInfo() {
  return (
    <>
      <Row gutter={16}>
        <Col xs={12} md={6}>
          <IntervalInputFormItem
            label="湿膜厚度"
            name="wetThickness"
            unit="μm"
          />
        </Col>
        <Col xs={12} md={6}>
          <IntervalInputFormItem
            label="干膜厚度"
            name="dryThickness"
            unit="nm"
          />
        </Col>
        <Col xs={12} md={6}>
          <Form.Item
            label="干膜厚度偏差"
            name="dryDeviation"
            initialValue="＜5%"
          >
            <Input />
          </Form.Item>
        </Col>
        <Col xs={12} md={6}>
          <IntervalInputFormItem
            label="涂布产量"
            name="yield"
            units={YIELD_UNITS.map((u) => u.value)}
          />
        </Col>
        <Col xs={12} md={6}>
          <Form.Item label="基材类型" name="substrateType" initialValue="玻璃">
            <Select options={[{ label: "玻璃", value: "玻璃" }]} />
          </Form.Item>
        </Col>
        <Col xs={12} md={6}>
          <IntervalInputFormItem
            label="基材宽度"
            name="substrateWidth"
            unit="mm"
          />
        </Col>
        <Col xs={12} md={6}>
          <IntervalInputFormItem
            label="基材厚度"
            name="substrateThickness"
            unit="μm"
          />
        </Col>
        <Col xs={24} md={12}>
          <Form.Item label="流体的控制方法" name="controlMethod">
            <Input />
          </Form.Item>
        </Col>
        <Col xs={12} md={6}>
          <IntervalInputFormItem
            label="泵后压力"
            name="pumpPressure"
            unit="Mpa"
          />
        </Col>
        <Col xs={12} md={6}>
          <Form.Item label="模头垫片" name="needShim" initialValue="不需要">
            <Radio.Group>
              <Radio value="需要">需要</Radio>
              <Radio value="不需要">不需要</Radio>
            </Radio.Group>
          </Form.Item>
        </Col>
        <Form.Item noStyle dependencies={["needShim"]}>
          {({ getFieldValue }) =>
            getFieldValue("needShim") === "需要" ? (
              <>
                <Col xs={12} md={6}>
                  <Form.Item label="垫片材质" name="shimMaterial">
                    <CustomSelect
                      initialGroups={MATERIAL_OPTIONS}
                      dropdown={true}
                      showSearch={false}
                    />
                  </Form.Item>
                </Col>
                <Col xs={12} md={6}>
                  <Form.Item label="垫片规格及厚度" name="shimSpec">
                    <Input />
                  </Form.Item>
                </Col>
              </>
            ) : null
          }
        </Form.Item>
        <Col xs={24} md={12}>
          <Form.Item label="模头主体材料" name="bodyMaterial">
            <CustomSelect
              initialGroups={MATERIAL_OPTIONS}
              dropdown={true}
              showSearch={false}
            />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item
            label="紧固件(螺丝)"
            name="fastener"
            initialValue="不锈钢螺丝"
          >
            <AutoComplete options={[{ value: "不锈钢螺丝" }]} />
          </Form.Item>
        </Col>
        <Col xs={12} md={6}>
          <Form.Item label="模唇直线度" name="lipStraightness">
            <InputNumber
              style={{ width: "100%" }}
              formatter={(v) => (v ? `≤${v}μm` : "")}
              parser={(v) => v?.replace(/≤|μm/g, "") as any}
            />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item
            label="抛光精度要求"
            name="polish"
            initialValue="腔体及流面粗糙度：Ra<0.025."
          >
            <AutoComplete
              options={[{ value: "供方设计" }, { value: "需方提供尺寸" }]}
            />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item label="进料口尺寸" name="feedSize">
            <AutoComplete
              options={[{ value: "供方设计" }, { value: "需方提供尺寸" }]}
            />
          </Form.Item>
        </Col>
        <Col xs={24}>
          <Form.Item label="特殊要求" name="special">
            <TextArea rows={3} />
          </Form.Item>
        </Col>
      </Row>
    </>
  );
}
