import React, { useState, useEffect } from "react";
import { Radio, InputNumber, Form, Space } from "@/components/ui/core";

interface PolishingPrecisionProps {
  value?: any;
  onChange?: (value: any) => void;
}

const PolishingPrecision: React.FC<PolishingPrecisionProps> = ({
  value = {},
  onChange,
}) => {
  // 默认值
  const [precision, setPrecision] = useState({
    level: "s",
    lip: "0.015-0.025",
    lipCustom: "",
    flow: "0.015-0.025",
    flowCustom: "",
    otherFlow: "0.02-0.03",
    otherFlowCustom: "",
    shape: "0.06-0.08",
    shapeCustom: "",
  });

  // 监听外部value变化
  useEffect(() => {
    if (value) {
      setPrecision((prev) => ({ ...prev, ...value }));
    }
  }, [value]);

  // 触发onChange
  const triggerChange = (changedValue: any) => {
    const newValue = { ...precision, ...changedValue };
    setPrecision(newValue);
    onChange?.(newValue);
  };

  // 处理精度等级变化
  const handleLevelChange = (e: any) => {
    const level = e.target.value;
    let newValues: any = { level };

    if (level === "s") {
      newValues = {
        ...newValues,
        lip: "0.015-0.025",
        flow: "0.015-0.025",
        otherFlow: "0.02-0.03",
        shape: "0.06-0.08",
      };
    } else if (level === "a") {
      newValues = {
        ...newValues,
        lip: "0.02-0.03",
        flow: "0.02-0.03",
        otherFlow: "0.03-0.04",
        shape: "0.06-0.08",
      };
    } else if (level === "b") {
      newValues = {
        ...newValues,
        lip: "0.04-0.05",
        flow: "0.04-0.05",
        otherFlow: "0.04-0.06",
        shape: "0.08-0.09",
      };
    }

    triggerChange(newValues);
  };

  // 处理各项目变化
  const handleItemChange = (field: string, val: string) => {
    const newValues = { [field]: val };

    // 检查是否需要更新精度等级
    const allS =
      precision.lip === "0.015-0.025" &&
      precision.flow === "0.015-0.025" &&
      precision.otherFlow === "0.02-0.03" &&
      precision.shape === "0.06-0.08";

    const allA =
      precision.lip === "0.02-0.03" &&
      precision.flow === "0.02-0.03" &&
      precision.otherFlow === "0.03-0.04" &&
      precision.shape === "0.06-0.08";

    const allB =
      precision.lip === "0.04-0.05" &&
      precision.flow === "0.04-0.05" &&
      precision.otherFlow === "0.04-0.06" &&
      precision.shape === "0.08-0.09";

    if (allS) {
      newValues.level = "s";
    } else if (allA) {
      newValues.level = "a";
    } else if (allB) {
      newValues.level = "b";
    } else {
      newValues.level = "custom";
    }

    triggerChange(newValues);
  };

  // 处理自定义输入变化
  const handleCustomChange = (field: string, val: string) => {
    triggerChange({ [field]: val });
  };

  return (
    <div>
      {/* 精度等级选择 */}
      <Form.Item label="精度选择">
        <Radio.Group value={precision.level} onChange={handleLevelChange}>
          <Radio value="s">S级</Radio>
          <Radio value="a">A级</Radio>
          <Radio value="b">B级</Radio>
          <Radio value="custom">自定义</Radio>
        </Radio.Group>
      </Form.Item>

      {/* 模唇流面抛光精度 */}
      <Form.Item label="模唇流面抛光精度(um)">
        <Radio.Group
          value={precision.lip}
          onChange={(e) => handleItemChange("lip", e.target.value)}
        >
          <Radio value="0.015-0.025">0.015-0.025</Radio>
          <Radio value="0.02-0.03">0.02-0.03</Radio>
          <Radio value="0.04-0.05">0.04-0.05</Radio>
          <Radio value="custom">
            自定义
            {precision.lip === "custom" && (
              <Space style={{ marginLeft: 8 }}>
                {/* <InputNumber 
                //   min={0} 
                  step={0.001} 
                  value={precision.lipCustom} 
                  onChange={(val) => handleCustomChange('lipCustom', val)}
                  placeholder="输入最小值"
                />
                -
                <InputNumber 
                //   min={0} 
                  step={0.001} 
                  value={precision.lipCustom} 
                  onChange={(val) => handleCustomChange('lipCustom', val)}
                  placeholder="输入最大值"
                /> */}
              </Space>
            )}
          </Radio>
        </Radio.Group>
      </Form.Item>

      {/* 其他三个RadioGroup的代码结构相同，只是选项不同 */}
      {/* 模唇流面抛光精度2 */}
      <Form.Item label="模唇流面抛光精度(um)">
        <Radio.Group
          value={precision.flow}
          onChange={(e) => handleItemChange("flow", e.target.value)}
        >
          <Radio value="0.015-0.025">0.015-0.025</Radio>
          <Radio value="0.02-0.03">0.02-0.03</Radio>
          <Radio value="0.04-0.05">0.04-0.05</Radio>
          <Radio value="custom">
            自定义
            {precision.flow === "custom" && (
              <Space style={{ marginLeft: 8 }}>
                {/* <InputNumber 
                  min={0} 
                  step={0.001} 
                  value={precision.flowCustom} 
                  onChange={(val) => handleCustomChange('flowCustom', val)}
                  placeholder="输入最小值"
                />
                -
                <InputNumber 
                  min={0} 
                  step={0.001} 
                  value={precision.flowCustom} 
                  onChange={(val) => handleCustomChange('flowCustom', val)}
                  placeholder="输入最大值"
                /> */}
              </Space>
            )}
          </Radio>
        </Radio.Group>
      </Form.Item>

      {/* 其它流面抛光精度 */}
      <Form.Item label="其它流面抛光精度(um)">
        <Radio.Group
          value={precision.otherFlow}
          onChange={(e) => handleItemChange("otherFlow", e.target.value)}
          block
        >
          <Radio value="0.02-0.03">0.02-0.03</Radio>
          <Radio value="0.03-0.04">0.03-0.04</Radio>
          <Radio value="0.04-0.06">0.04-0.06</Radio>
          <Radio value="custom">
            自定义
            {precision.otherFlow === "custom" && (
              <Space style={{ marginLeft: 8 }}>
                {/* <InputNumber 
                  min={0} 
                  step={0.001} 
                  value={precision.otherFlowCustom} 
                  onChange={(val) => handleCustomChange('otherFlowCustom', val)}
                  placeholder="输入最小值"
                />
                -
                <InputNumber 
                  min={0} 
                  step={0.001} 
                  value={precision.otherFlowCustom} 
                  onChange={(val) => handleCustomChange('otherFlowCustom', val)}
                  placeholder="输入最大值"
                /> */}
              </Space>
            )}
          </Radio>
        </Radio.Group>
      </Form.Item>

      {/* 外形抛光精度 */}
      <Form.Item label="外形抛光精度(um)">
        <Radio.Group
          value={precision.shape}
          onChange={(e) => handleItemChange("shape", e.target.value)}
          optionType="button"
          block
        >
          <Radio value="0.06-0.08">0.06-0.08</Radio>
          <Radio value="0.06-0.08">0.06-0.08</Radio>
          <Radio value="0.08-0.09">0.08-0.09</Radio>
          <Radio value="custom">
            自定义
            {precision.shape === "custom" && (
              <Space style={{ marginLeft: 8 }}>
                {/* <InputNumber 
                  min={0} 
                  step={0.001} 
                  value={precision.shapeCustom} 
                  onChange={(val) => handleCustomChange('shapeCustom', val)}
                  placeholder="输入最小值"
                />
                -
                <InputNumber 
                  min={0} 
                  step={0.001} 
                  value={precision.shapeCustom} 
                  onChange={(val) => handleCustomChange('shapeCustom', val)}
                  placeholder="输入最大值"
                /> */}
              </Space>
            )}
          </Radio>
        </Radio.Group>
      </Form.Item>
    </div>
  );
};

export default PolishingPrecision;
