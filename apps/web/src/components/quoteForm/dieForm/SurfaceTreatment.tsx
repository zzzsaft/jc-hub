import { TailCard } from "@/components/ui/proComponents";
import { AutoComplete, Col, Form, Radio, Row } from "@/components/ui/core";
import {
  autoCompleteIntervalInputRules,
  RadioWithInputRules,
} from "@/utils/rules";
import TextArea from "@/components/ui/TextArea";
import { AutoCompleteIntervalInput } from "@/components/general/AutoCompleteIntervalInput";
import { RadioWithInput } from "@/components/general/RadioWithInput";

// 常量定义
const precisionLevelOptions = [
  { label: "S级", value: "S" },
  { label: "A级", value: "A" },
  { label: "B级", value: "B" },
  { label: "自定义", value: "custom" },
];

const precisionOptions = {
  lipSurface: [
    { label: "S: 0.015~0.025", value: "0.015~0.025", level: "S" },
    { label: "A: 0.02~0.03", value: "0.02~0.03", level: "A" },
    { label: "B: 0.04~0.05", value: "0.04~0.05", level: "B" },
  ],
  otherSurface: [
    { label: "S: 0.02~0.03", value: "0.02~0.03", level: "S" },
    { label: "A: 0.03~0.04", value: "0.03~0.04", level: "A" },
    { label: "B: 0.04~0.06", value: "0.04~0.06", level: "B" },
  ],
  shape: [{ label: "A: 0.06~0.08", value: "0.06~0.08", level: "A" }],
};
const CHANNEL_THICKNESS = [
  { label: "S: 0.02~0.03", value: "0.02~0.03", level: "S" },
  { label: "A: 0.025~0.05", value: "0.025~0.05", level: "A" },
  { label: "B: 0.04~0.05", value: "0.04~0.05", level: "B" },
];

const OUTER_THICKNESS = [
  { label: "S: 0.01~0.02", value: "0.01~0.02", level: "S" },
  { label: "A: 0.02~0.03", value: "0.02~0.03", level: "A" },
  { label: "B: 0.03~0.04", value: "0.03~0.04", level: "B" },
];

const toInterval = (val: string) => {
  const [front, rear] = val.split("~");
  return {
    front: front ? parseFloat(front) : NaN,
    rear: rear ? parseFloat(rear) : NaN,
    value: val,
    unit: "mm",
  } as const;
};

const defaultChannelThickness = {
  value: toInterval(CHANNEL_THICKNESS[0].value),
  level: CHANNEL_THICKNESS[0].level,
};

const defaultOuterThickness = {
  value: toInterval(OUTER_THICKNESS[0].value),
  level: OUTER_THICKNESS[0].level,
};

const PLATING_REQUIREMENT = [
  { label: "镀铬", value: "镀铬" },
  { label: "镀镍磷合金", value: "镀镍磷合金" },
  { label: "其他", value: "other", showInput: true },
];

export const SurfaceTreatment = () => {
  return (
    <TailCard
      title="表面处理"
      collapsible
      defaultCollapsed={false}
      style={{ marginBottom: 16 }}
      headerBordered
    >
      <Row gutter={16}>
        <Col xs={24} sm={12}>
          <Form.Item label="精度等级" name="precisionLevel" initialValue="S">
            <Radio.Group
              options={precisionLevelOptions}
              optionType="button"
              buttonStyle="solid"
            />
          </Form.Item>
        </Col>
        <Form.Item noStyle dependencies={["precisionLevel"]}>
          {({ getFieldValue }) => {
            const precisionLevel = getFieldValue("precisionLevel");
            return (
              <Col xs={24} sm={12}>
                {/* 模唇流面抛光精度 */}
                <Form.Item
                  label="模唇流面抛光精度"
                  name="lipSurfacePrecision"
                  rules={[
                    { required: true, message: "请选择或输入抛光精度" },
                    ...autoCompleteIntervalInputRules,
                  ]}
                >
                  <AutoCompleteIntervalInput
                    options={precisionOptions.lipSurface}
                    disabled={precisionLevel !== "custom"}
                    level={precisionLevel}
                    addonAfter={"μm"}
                  />
                </Form.Item>
              </Col>
            );
          }}
        </Form.Item>
        <Form.Item noStyle dependencies={["precisionLevel"]}>
          {({ getFieldValue }) => {
            const precisionLevel = getFieldValue("precisionLevel");
            return (
              <Col xs={24} sm={12}>
                {/* 其它流面抛光精度 */}
                <Form.Item
                  label="其它流面抛光精度"
                  name="otherSurfacePrecision"
                  rules={[
                    {
                      required: true,
                      message: "请选择或输入抛光精度",
                    },
                    ...autoCompleteIntervalInputRules,
                  ]}
                >
                  <AutoCompleteIntervalInput
                    options={precisionOptions.otherSurface}
                    disabled={precisionLevel !== "custom"}
                    level={precisionLevel}
                    addonAfter={"μm"}
                  />
                </Form.Item>
              </Col>
            );
          }}
        </Form.Item>
        <Form.Item noStyle dependencies={["precisionLevel"]}>
          {({ getFieldValue }) => {
            const precisionLevel = getFieldValue("precisionLevel");
            return (
              <Col xs={24} sm={12}>
                {/* 外形抛光精度 */}
                <Form.Item
                  label="外形抛光精度"
                  name="shapePrecision"
                  rules={[
                    {
                      required: true,
                      message: "请选择或输入抛光精度",
                    },
                    ...autoCompleteIntervalInputRules,
                  ]}
                >
                  <AutoCompleteIntervalInput
                    options={precisionOptions.shape}
                    disabled={precisionLevel !== "custom"}
                    level={precisionLevel}
                    addonAfter={"μm"}
                  />
                </Form.Item>
              </Col>
            );
          }}
        </Form.Item>
        <Col xs={12} md={12}>
          {/* 是否电镀 */}
          <Form.Item
            name="hasLaser"
            label="是否激光硬化"
            rules={[{ required: true, message: "请选择是否激光硬化" }]}
            initialValue={false}
          >
            <Radio.Group>
              <Radio value={true}>是</Radio>
              <Radio value={false}>否</Radio>
            </Radio.Group>
          </Form.Item>
        </Col>
        <Col xs={12} md={12}>
          {/* 是否电镀 */}
          <Form.Item
            name="hasPlating"
            label="是否电镀"
            rules={[{ required: true, message: "请选择是否电镀" }]}
          >
            <Radio.Group>
              <Radio value={true}>是</Radio>
              <Radio value={false}>否</Radio>
            </Radio.Group>
          </Form.Item>
        </Col>

        <Form.Item noStyle dependencies={["hasPlating"]}>
          {({ getFieldValue }) => {
            const hasPlating = getFieldValue("hasPlating");
            return (
              hasPlating && (
                <>
                  <Col xs={12} md={12}>
                    {/* 表面镀层要求 */}
                    <Form.Item
                      name="platingRequirement"
                      label="表面镀层要求"
                      rules={[
                        { required: true, message: "请选择表面镀层要求" },
                        ...RadioWithInputRules,
                      ]}
                    >
                      <RadioWithInput options={PLATING_REQUIREMENT} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12}>
                    {/* 流道表面镀层硬度 */}
                    <Form.Item
                      name="channelHardness"
                      label="流道表面镀层硬度"
                      rules={[
                        { required: true, message: "请输入流道表面镀层硬度" },
                      ]}
                      initialValue={"60-65Rockwellc"}
                    >
                      <AutoComplete
                        placeholder="请输入流道表面镀层硬度"
                        options={[{ value: "60-65Rockwellc" }]}
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12}>
                    {/* 流道表面镀层厚度 */}
                    <Form.Item
                      name="channelThickness"
                      label="流道表面镀层厚度"
                      rules={[
                        { required: true, message: "请选择流道表面镀层厚度" },
                        ...autoCompleteIntervalInputRules,
                      ]}
                      initialValue={defaultChannelThickness}
                    >
                      <AutoCompleteIntervalInput
                        options={CHANNEL_THICKNESS}
                        addonAfter={"mm"}
                      />
                    </Form.Item>
                  </Col>

                  <Col xs={24} sm={12}>
                    {/* 外表面镀层厚度 */}
                    <Form.Item
                      name="outerThickness"
                      label="外表面镀层厚度"
                      rules={[
                        { required: true, message: "请选择外表面镀层厚度" },
                        ...autoCompleteIntervalInputRules,
                      ]}
                      initialValue={defaultOuterThickness}
                    >
                      {/* <IntervalInputWithUnit /> */}
                      <AutoCompleteIntervalInput
                        options={OUTER_THICKNESS}
                        addonAfter={"mm"}
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12}>
                    {/* 表面处理备注 */}
                    <Form.Item name="surfaceRemark" label="表面处理备注">
                      <TextArea rows={2} placeholder="请输入表面处理备注信息" />
                    </Form.Item>
                  </Col>
                </>
              )
            );
          }}
        </Form.Item>
      </Row>
    </TailCard>
  );
};
