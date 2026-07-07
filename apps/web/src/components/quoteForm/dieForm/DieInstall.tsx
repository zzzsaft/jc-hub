import { TailCard } from "@/components/ui/proComponents";
import { Col, Form, InputNumber, Radio, Row, Space, Tooltip } from "@/components/ui/core";
import { RadioWithInputRules } from "@/utils/rules";
import { CustomSelect } from "@/components/general/CustomSelect";
import { RadioWithInput } from "@/components/general/RadioWithInput";
import { QuestionCircleOutlined } from "@/components/ui/icons";

// 常量定义

const INSTALL_OPTIONS = {
  基础: ["平挤出", "下挤出"],
  其他: ["45° 挤出微调朝上", "45° 挤出微调朝下", "30° 斜三辊安装"],
};

const FEED_SIZE = [
  { label: "供方设计", value: "供方设计" },
  { label: "需方提供尺寸", value: "需方提供尺寸" },
];

const FEED_OPTIONS = [
  { label: "中央圆口进料", value: "中央圆口进料" },
  { label: "中央方口进料", value: "中央方口进料" },
  {
    label: "其他形状或不同位置进料",
    value: "其他形状或不同位置进料",
    showInput: true,
  },
];

const WIRING_METHOD = [
  { label: "按精诚标准接线", value: "按精诚标准接线" },
  { label: "带护罩全封闭接线", value: "带护罩全封闭接线" },
  { label: "模体开槽接线", value: "模体开槽接线" },
  { label: "其他", value: "other", showInput: true },
];

export const DieInstall = () => {
  return (
    <TailCard
      title="模具安装"
      collapsible
      defaultCollapsed={false}
      style={{ marginBottom: 16 }}
      headerBordered
    >
      <Row gutter={16}>
        <Col xs={24} md={8}>
          <Form.Item
            name="installMethod"
            label="模头安装方式"
            rules={[{ required: true, message: "请选择模头安装方式" }]}
          >
            <CustomSelect initialGroups={INSTALL_OPTIONS} dropdown={true} />
          </Form.Item>
        </Col>
        <Col xs={12} md={12}>
          <Form.Item
            name="feedingMethod"
            label="进料口方式"
            rules={[
              { required: true, message: "请选择进料口方式" },
              ...RadioWithInputRules,
            ]}
          >
            <RadioWithInput options={FEED_OPTIONS} />
          </Form.Item>
        </Col>
        <Col xs={12} md={12}>
          <Form.Item
            name="feedingSize"
            label="进料口尺寸"
            rules={[
              { required: true, message: "请选择进料口尺寸" },
              ...RadioWithInputRules,
            ]}
          >
            <RadioWithInput options={FEED_SIZE} />
          </Form.Item>
        </Col>
        <Col xs={12} md={8}>
          {/* 1. 模头固定小车 */}
          <Form.Item
            name="hasCart"
            label="模头固定小车"
            rules={[{ required: true, message: "请选择是否有模头固定小车" }]}
            initialValue={"无"}
          >
            <Radio.Group>
              <Radio value="有">有</Radio>
              <Radio value="无">无</Radio>
            </Radio.Group>
          </Form.Item>
        </Col>
        <Form.Item noStyle dependencies={["hasCart"]}>
          {({ getFieldValue }) => {
            const hasCart = getFieldValue("hasCart"); // 获取 hasCart 的值
            return hasCart === "有" ? (
              <>
                <Col xs={12} md={8}>
                  <Form.Item
                    name="centerHeight"
                    label="小车中心高度"
                    rules={[{ required: true, message: "请输入中心高度" }]}
                  >
                    <InputNumber
                      min={0}
                      step={0.1}
                      formatter={(value) => `${value}m`}
                      parser={(value) => value?.replace(/m/g, "") as any}
                    />
                  </Form.Item>
                </Col>
              </>
            ) : null;
          }}
        </Form.Item>

        <Col xs={24} md={12}>
          {/* 2. 接线方式 */}
          <Form.Item
            name="wiringMethod"
            label="接线方式"
            rules={[{ required: true, message: "请选择接线方式" }]}
          >
            <RadioWithInput options={WIRING_METHOD} />
          </Form.Item>
        </Col>
        <Col xs={12} md={8}>
          {/* 3. 电源连接线长度 */}
          <Form.Item
            name="powerCableLength"
            label={
              <Space>
                电源线长度
                <Tooltip title="模头宽度1.5m以下标配3m，以上标配5m">
                  <QuestionCircleOutlined />
                </Tooltip>
              </Space>
            }
            rules={[{ required: true, message: "请输入电源连接线长度" }]}
          >
            <InputNumber
              min={0}
              step={0.5}
              formatter={(value) => `${value}m`}
              parser={(value) => value?.replace(/m/g, "") as any}
            />
          </Form.Item>
        </Col>

        {/* 4. 热膨胀数据连接线长（条件显示） */}
        <Form.Item noStyle dependencies={["upperLipStructure"]}>
          {({ getFieldValue }) => {
            const upperLipStructure = getFieldValue("upperLipStructure"); // 获取 hasCart 的值
            return upperLipStructure === "自动全推式" ||
              upperLipStructure === "自动推拉式" ? (
              <Col xs={12} md={8}>
                <Form.Item
                  name="thermalExpansionCableLength"
                  label={
                    <Space>
                      热膨胀数据长
                      <Tooltip title="标配5m">
                        <QuestionCircleOutlined />
                      </Tooltip>
                    </Space>
                  }
                  rules={[
                    { required: true, message: "请输入热膨胀数据连接线长度" },
                  ]}
                >
                  <InputNumber
                    min={0}
                    step={0.5}
                    formatter={(value) => `${value}m`}
                    parser={(value) => value?.replace(/m/g, "") as any}
                  />
                </Form.Item>
              </Col>
            ) : null;
          }}
        </Form.Item>

        <Col xs={12} md={8}>
          {/* 5. 模体接插件 */}
          <Form.Item
            name="bodyConnector"
            label="模体接插件"
            rules={[{ required: true, message: "请选择模体接插件类型" }]}
            initialValue={"方形"}
          >
            <Radio.Group>
              {/* <Radio value="无">无</Radio> */}
              <Radio value="方形">方形</Radio>
              <Radio value="特殊">特殊</Radio>
            </Radio.Group>
          </Form.Item>
        </Col>
        <Col xs={12} md={12}>
          {/* 6. 侧板接插件 */}
          <Form.Item
            name="sideConnector"
            label="侧板接插件"
            rules={[{ required: true, message: "请选择侧板接插件类型" }]}
            initialValue={"插头"}
          >
            <Radio.Group>
              <Radio value="插头">插头</Radio>
              <Radio value="金属软线">金属软线</Radio>
              <Radio value="无">无</Radio>
            </Radio.Group>
          </Form.Item>
        </Col>
      </Row>
    </TailCard>
  );
};
