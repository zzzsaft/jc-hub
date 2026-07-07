import { TailCard, TailFormDependency } from "@/components/ui/proComponents";
import { Badge, Col, Form, Radio, Row, InputNumber } from "@/components/ui/core";
import { MATERIAL_OPTIONS } from "@/utils/material";
import { CustomSelect } from "@/components/general/CustomSelect";
import { AutoCompleteInput } from "@/components/general/AutoCompleteInput";
import { IntervalInputFormItem } from "@/components/general/IntervalInput";
import TailFormListWrapper from "../formComponents/TailFormListWrapper";

interface DieBodyProps {
  isHollow?: boolean;
}

// 常量定义
const UPPER_LIP_OPTIONS = {
  手动: ["手动差动推式", "手动全推式", "手动推拉式", "手动减力推拉式"],
  自动: ["自动全推式", "自动推拉式"],
  其他: ["上模整体结构"],
};

const LOWER_LIP_OPTIONS = {
  下模唇: ["下模整体结构", "下模固定可拆卸", "下模可预粗调", "下模快速开口"],
};

const WIDTH_ADJUSTMENT_OPTIONS = {
  无挡块: ["不可调节"],
  外挡: [
    "外挡（技术设计）",
    "开槽外挡",
    "挂钩外挡",
    "手动丝杆外挡",
    "电动丝杆外挡",
    "齿轮调节外挡",
  ],
  内挡: ["固定式内挡", "手动丝杆内挡", "电动丝杆内挡"],
  其他: ["不锈钢垫片"],
};

const FINE_TUNING_OPTIONS = [
  { label: "19", value: "19" },
  { label: "21", value: "21" },
  { label: "25.4-默认", value: "25.4" },
  { label: "28.5", value: "28.5" },
  { label: "30", value: "30" },
];

const UPPER_OPTIONS = [
  { label: "无阻流棒", value: "无阻流棒" },
  { label: "45°阻流棒", value: "45°阻流棒" },
  { label: "70°阻流棒", value: "70°阻流棒" },
  { label: "90°阻流棒", value: "90°阻流棒" },
  // { label: "其他", value: "other", showInput: true },
];

const LOWER_OPTIONS = [
  { label: "无阻流棒", value: "无阻流棒" },
  { label: "90°阻流棒", value: "90°阻流棒" },
  // { label: "其他", value: "other", showInput: true },
];

export const DieBody: React.FC<DieBodyProps> = ({ isHollow = false }) => {
  const upperLipOptions = isHollow
    ? { 默认: ["推式弹性微调（中空专用）"] }
    : UPPER_LIP_OPTIONS;
  const lowerLipOptions = isHollow
    ? { 默认: ["推式弹性微调（中空专用）"] }
    : LOWER_LIP_OPTIONS;
  const widthAdjustmentOptions: any = isHollow
    ? { 外挡: ["挂钩外挡"], 无: ["无"] }
    : WIDTH_ADJUSTMENT_OPTIONS;
  return (
    <TailCard
      title="模体配置"
      collapsible
      defaultCollapsed={false}
      style={{ marginBottom: 16 }}
      headerBordered
    >
      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Form.Item
            name="dieMaterial"
            label="模体材质"
            rules={[{ required: true, message: "请选择模体材质" }]}
          >
            <CustomSelect
              initialGroups={MATERIAL_OPTIONS}
              dropdown={true}
              showSearch={false}
            />
          </Form.Item>
        </Col>
        <Col xs={12} md={12}>
          {/* 3. 宽幅调节方式 */}
          <Form.Item
            name="widthAdjustment"
            label="宽幅调节方式"
            rules={[
              { required: true, message: "请选择宽幅调节方式" },
              {
                validator(_, value) {
                  if (!value) return Promise.resolve();
                  const selected = Array.isArray(value) ? value : [value];
                  if (selected.length > 2) {
                    return Promise.reject("最多选择两项");
                  }
                  const innerOptions = widthAdjustmentOptions["内挡"] || [];
                  const outerOptions = widthAdjustmentOptions["外挡"] || [];
                  const innerCount = selected.filter((v) =>
                    innerOptions.includes(v)
                  ).length;
                  const outerCount = selected.filter((v) =>
                    outerOptions.includes(v)
                  ).length;
                  if (innerCount > 1) {
                    return Promise.reject("内挡最多选择一项");
                  }
                  if (outerCount > 1) {
                    return Promise.reject("外挡最多选择一项");
                  }
                  return Promise.resolve();
                },
              },
            ]}
            initialValue={isHollow ? "挂钩外挡" : undefined}
          >
            <CustomSelect
              initialGroups={widthAdjustmentOptions}
              mode="multiple"
              dropdown={false}
            />
          </Form.Item>
        </Col>
        <Col xs={12} md={12}>
          {/* 1. 上模唇结构 */}
          <Form.Item
            name="upperLipStructure"
            label="上模唇结构"
            rules={[{ required: true, message: "请选择上模唇结构" }]}
            initialValue={isHollow ? "推式弹性微调（中空专用）" : undefined}
          >
            <CustomSelect initialGroups={upperLipOptions} dropdown={false} />
          </Form.Item>
        </Col>
        <Col xs={12} md={12}>
          {/* 2. 下模唇结构 */}
          <Form.Item
            name="lowerLipStructure"
            label="下模唇结构"
            rules={[{ required: true, message: "请选择下模唇结构" }]}
            initialValue={isHollow ? "推式弹性微调（中空专用）" : undefined}
          >
            <CustomSelect initialGroups={lowerLipOptions} dropdown={false} />
          </Form.Item>
        </Col>

        <Col xs={12} md={6}>
          {/* 4. 微调间距 */}
          <Form.Item
            name="fineTuningSpacing"
            label="微调间距"
            rules={[
              { required: true, message: "请选择微调间距" },
              {
                // required: true,
                warningOnly: true,
                validator(_, value) {
                  if (
                    value &&
                    !FINE_TUNING_OPTIONS.map((i) => i.value).includes(
                      value.toString()
                    )
                  ) {
                    return Promise.reject(`${value}mm属于定制微调间距`);
                  }
                  return Promise.resolve();
                },
              },
            ]}
            initialValue={25.4}
          >
            <AutoCompleteInput
              options={FINE_TUNING_OPTIONS}
              placeholder="请选择微调间距"
            />
          </Form.Item>
        </Col>
        <Col xs={12} md={6}>
          <Form.Item
            name="topFlowRestrictor"
            label="阻流棒"
            rules={[
              { required: true, message: "请选择上模阻流棒" },
              // ...RadioWithInputRules,
            ]}
          >
            <AutoCompleteInput
              options={UPPER_OPTIONS}
              placeholder="阻流棒"
              type="text"
              addonAfter={null}
            />
          </Form.Item>
        </Col>
        {/* <Col xs={12} md={6}>
          <Form.Item
            name="bottomFlowRestrictor"
            label="下模阻流棒"
            rules={[{ required: true, message: "请选择下模阻流棒" }]}
          >
            <AutoCompleteInput
              options={LOWER_OPTIONS}
              placeholder="下模阻流棒"
              type="text"
              addonAfter={null}
              // disabled={true}
            />
          </Form.Item>
        </Col> */}
        <Form.Item noStyle dependencies={["lowerLipStructure"]}>
          {({ getFieldValue }) =>
            getFieldValue("lowerLipStructure")?.includes("整体") ? null : (
              <Col xs={12} md={6}>
                <Form.Item
                  name="lipCount"
                  label="模唇数量"
                  rules={[{ required: true, message: "请输入模唇数量" }]}
                  initialValue={1}
                >
                  <InputNumber min={1} max={5} style={{ width: "100%" }} />
                </Form.Item>
              </Col>
            )
          }
        </Form.Item>
        <Col xs={24} md={24}>
          <TailFormDependency name={["lipCount"]}>
            {({ lipCount }) =>
              lipCount > 1 ? (
                <TailFormListWrapper
                  name="lipThicknessRange"
                  // rules={[{ require: true }]}
                  label="模唇厚度范围"
                  canCreate={false}
                  canDelete={false}
                  min={lipCount}
                  max={lipCount}
                  isHorizontal
                  formItems={
                    <IntervalInputFormItem
                      name={[]}
                      rules={[{ required: true, message: "请输入厚度范围" }]}
                      unit="mm"
                    />
                  }
                />
              ) : null
            }
          </TailFormDependency>
        </Col>
        {isHollow && (
          <Col xs={12} md={6}>
            <IntervalInputFormItem
              name="coreThickness"
              label="模芯厚度"
              unit="mm"
            />
          </Col>
        )}
        <Col xs={12} md={8}>
          <Form.Item
            name="smartRegulator"
            label={
              <span>
                是否搭配智能调节器{" "}
                <span
                  style={{
                    color: "#ff4d4f",
                    fontSize: 12,
                    // paddingBottom: "100px",
                  }}
                >
                  NEW
                </span>
              </span>
            }
            rules={[{ required: true, message: "是否与原购买过的产品互配" }]}
          >
            <Radio.Group>
              <Radio value={true}>是</Radio>
              <Radio value={false}>否</Radio>
            </Radio.Group>
          </Form.Item>
        </Col>
        <Col xs={12} md={8}>
          <Form.Item
            name="thicknessGauge"
            label="是否选配测厚仪"
            rules={[{ required: true, message: "是否选配测厚仪" }]}
            initialValue={false}
          >
            <Radio.Group>
              <Radio value={true}>是</Radio>
              <Radio value={false}>否</Radio>
            </Radio.Group>
          </Form.Item>
        </Col>
        <Col xs={12} md={8}>
          <Form.Item
            name="hasManifold"
            label="是否选配合流器"
            rules={[{ required: true, message: "请选择是否选配合流器" }]}
            initialValue={false}
          >
            <Radio.Group>
              <Radio value={true}>是</Radio>
              <Radio value={false}>否</Radio>
            </Radio.Group>
          </Form.Item>
        </Col>
      </Row>
    </TailCard>
  );
};
