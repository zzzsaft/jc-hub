import { TailCard, TailFormDependency } from "@/components/ui/proComponents";
import {
  AutoComplete,
  Checkbox,
  Col,
  Divider,
  Form,
  Input,
  InputNumber,
  Radio,
  Row,
  Segmented,
  Select,
  Tag,
} from "@/components/ui/core";
import { useEffect, useState } from "react";
import ScrewForm from "../formComponents/ScrewForm";
import { MATERIAL } from "@/utils/material";
import { useProductStore } from "@/store/useProductStore";
import ExtruderForm from "../formComponents/ExtruderForm";
import { HeatingMethodSelect } from "../formComponents/HeatingMethodInput";
import { PowerInput } from "../formComponents/PowerInput";
import PowerFormItem from "../formComponents/PowerFormItem";
import { inputRule } from "@/utils/rules";

const tagsData = ["泵体", "传动系统", "控制系统"];
export const ModelOption = () => {
  const pump = useProductStore((state) => state.pump);
  const fetchPump = useProductStore((state) => state.fetchPump);
  useEffect(() => {
    if (pump.length == 0) {
      fetchPump();
    }
  }, []);

  return (
    <>
      <TailCard
        title="计量泵参数"
        collapsible
        defaultCollapsed={false}
        style={{ marginBottom: 16 }}
        headerBordered
      >
        <Row gutter={16}>
          <Col xs={24} md={24}>
            <Form.Item
              name="options"
              label="计量泵配置"
              // valuePropName="checked"
              rules={[{ required: true, message: "请选择至少一项计量泵配置" }]}
            >
              <Checkbox.Group
                options={tagsData.map((tag) => ({ label: tag, value: tag }))}
                onChange={(v) => {}}
              />
            </Form.Item>
          </Col>
          <Col xs={12} md={12}>
            <Form.Item
              name="pumpBracket"
              label="计量泵支架"
              rules={[{ required: true, message: "是否配套计量泵支架" }]}
              initialValue={false}
            >
              <Radio.Group>
                <Radio value={true}>是</Radio>
                <Radio value={false}>否</Radio>
              </Radio.Group>
            </Form.Item>
          </Col>
          <Form.Item noStyle dependencies={["pumpBracket"]}>
            {({ getFieldValue }) => {
              const 计量泵支架 = getFieldValue("pumpBracket");
              return (
                计量泵支架 && (
                  <Col xs={12} md={6}>
                    <Form.Item
                      name="pumpBracketSpec"
                      label="计量泵支架配置"
                      rules={[
                        { required: true, message: "请填写计量泵支架配置" },
                      ]}
                      initialValue={"精诚标准"}
                    >
                      <AutoComplete
                        options={[{ label: "精诚标准", value: "精诚标准" }]}
                      />
                    </Form.Item>
                  </Col>
                )
              );
            }}
          </Form.Item>
        </Row>
        {/* {"压力传感器孔"} */}
        <Row gutter={16}>
          <Col xs={12} md={8}>
            <Form.Item
              name="pressureSensorHole"
              label="压力传感器孔"
              rules={[{ required: true, message: "是否配套压力传感器孔" }]}
              initialValue={false}
            >
              <Radio.Group>
                <Radio value={true}>是</Radio>
                <Radio value={false}>否</Radio>
              </Radio.Group>
            </Form.Item>
          </Col>
          <Form.Item noStyle dependencies={["pressureSensorHole"]}>
            {({ getFieldValue }) => {
              const 压力传感器孔 = getFieldValue("pressureSensorHole");
              return (
                压力传感器孔 && (
                  <>
                    <Col xs={12} md={8}>
                      <Form.Item
                        name="prePump"
                        label="泵前"
                        rules={[{ required: true, message: "请输入泵前尺寸" }]}
                        initialValue={false}
                      >
                        <Radio.Group>
                          <Radio value={"国产"}>国产</Radio>
                          <Radio value={"进口"}>进口</Radio>
                        </Radio.Group>
                      </Form.Item>
                    </Col>
                    <Col xs={12} md={8}>
                      <Form.Item
                        name="postPump"
                        label="泵后"
                        rules={[{ required: true, message: "请输入泵后尺寸" }]}
                        initialValue={false}
                      >
                        <Radio.Group>
                          <Radio value={"国产"}>国产</Radio>
                          <Radio value={"进口"}>进口</Radio>
                        </Radio.Group>
                      </Form.Item>
                    </Col>
                  </>
                )
              );
            }}
          </Form.Item>
        </Row>
        <Row gutter={16}>
          {/* {"热电偶孔"} */}
          <Col xs={24} md={12}>
            <Form.Item
              name="tcHoleSpec"
              label="热电偶孔规格"
              rules={[{ required: true, message: "请填写热电偶孔规格" }]}
              initialValue="螺纹规格M12×1.5，热电偶由需方自配。"
            >
              <AutoComplete
                options={[
                  {
                    label: "螺纹规格M12×1.5，热电偶由需方自配。",
                    value: "螺纹规格M12×1.5，热电偶由需方自配。",
                  },
                ]}
              />
            </Form.Item>
          </Col>
          {/* {"泵体"} */}
          <Form.Item noStyle dependencies={["options", "temperature"]}>
            {({ getFieldValue }) => {
              const options = getFieldValue("options");
              const temperature = getFieldValue("temperature");

              return (
                options?.includes("泵体") && (
                  <>
                    <Divider size="small">泵体配置</Divider>
                    <Col xs={24} md={12}>
                      <Form.Item
                        label="泵体加热方式"
                        name="pumpHeatingType"
                        // rules={[{ required: true, message: "请选择加热方式" }]}
                      >
                        <HeatingMethodSelect
                          multiple
                          temperature={temperature?.value}
                        />
                      </Form.Item>
                    </Col>
                    <PowerFormItem
                      dependencyName="pumpHeatingType"
                      name="pumpHeatingVoltage"
                      label="泵体加热电压"
                      // rules={[{ required: true, message: "请选择加热方式" }]}
                    />
                    <Col xs={12} md={12}>
                      <Form.Item
                        label="紧固件（螺丝）"
                        name="fastener"
                        rules={[{ required: true, message: "请选择螺丝" }]}
                        initialValue="12.9高强度"
                      >
                        <AutoComplete
                          options={[
                            { label: "12.9高强度", value: "12.9高强度" },
                          ]}
                        />
                      </Form.Item>
                    </Col>
                  </>
                )
              );
            }}
          </Form.Item>
          {/* {"传动系统"} */}
          <Form.Item noStyle dependencies={["options"]}>
            {({ getFieldValue }) => {
              const options = getFieldValue("options");

              return (
                options?.includes("传动系统") && (
                  <>
                    <Divider size="small">传动系统配置</Divider>
                    <Col xs={12} md={8}>
                      <Form.Item
                        label="传动系统品牌"
                        name="transmissionSystemBrand"
                        rules={[{ required: true, message: "请输入品牌" }]}
                        initialValue=""
                      >
                        <AutoComplete
                          options={[
                            {
                              label: "常州莱克斯诺公司",
                              value: "常州莱克斯诺公司",
                            },
                            { label: "捷诺", value: "捷诺" },
                          ]}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={12} md={8}>
                      <Form.Item
                        label="调速电机"
                        name="variableSpeedMotor"
                        rules={[{ required: true, message: "请输入调速电机" }]}
                        initialValue="【】KW变频"
                      >
                        <AutoComplete
                          options={[
                            { label: "【】KW变频", value: "【】KW变频" },
                            { label: "NA", value: "NA" },
                          ]}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={12} md={8}>
                      <Form.Item
                        label="减速箱"
                        name="reducer"
                        rules={[
                          { required: true, message: "请输入减速箱" },
                          inputRule,
                        ]}
                        initialValue="1:【】（卧式）"
                      >
                        <AutoComplete
                          options={[
                            {
                              label: "1:【】（卧式）",
                              value: "1:【】（卧式）",
                            },
                            { label: "NA", value: "NA" },
                          ]}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item
                        label="万向传动轴"
                        name="driveShaft"
                        rules={[
                          { required: true, message: "请输入万向传动轴" },
                        ]}
                        initialValue="需方挤出机的中心高为：【】mm"
                      >
                        <AutoComplete
                          options={[
                            {
                              label: "需方挤出机的中心高为：【】mm",
                              value: "需方挤出机的中心高为：【】mm",
                            },
                            { label: "NA", value: "NA" },
                          ]}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item
                        label="电机电压"
                        name="transmissionSystemVoltage"
                        rules={[
                          { required: true, message: "请选择传动系统电机电压" },
                        ]}
                      >
                        <PowerInput />
                      </Form.Item>
                    </Col>
                  </>
                )
              );
            }}
          </Form.Item>
          {/* {"控制系统"} */}
          <Form.Item
            noStyle
            dependencies={["options", "prePumpControlSystem", "变频调速器"]}
          >
            {({ getFieldValue }) => {
              const options = getFieldValue("options");
              const 泵前控制系统 = getFieldValue("prePumpControlSystem");
              const 变频调速器 = getFieldValue("变频调速器");

              return (
                options?.includes("控制系统") && (
                  <>
                    <Divider size="small">控制系统配置</Divider>
                    <Col xs={24} md={12}>
                      <Form.Item
                        label="泵前控制系统"
                        name="prePumpControlSystem"
                        rules={[
                          { required: true, message: "请输入泵前控制系统" },
                        ]}
                      >
                        <AutoComplete
                          options={[
                            {
                              label:
                                "泵前国产熔体压力传感器；泵前压力闭环控制系统",
                              value:
                                "泵前国产熔体压力传感器；泵前压力闭环控制系统",
                            },
                            {
                              label:
                                "泵前进口熔体压力传感器；泵前压力闭环控制系统",
                              value:
                                "泵前进口熔体压力传感器；泵前压力闭环控制系统",
                            },
                            { label: "NA", value: "NA" },
                          ]}
                        />
                      </Form.Item>
                    </Col>
                    {泵前控制系统 && 泵前控制系统 != "NA" && (
                      <Col xs={12} md={8}>
                        <Form.Item
                          label="泵前控制系统品牌"
                          name="prePumpControlSystemBrand"
                          rules={[{ required: true, message: "请输入品牌" }]}
                          initialValue=""
                        >
                          <AutoComplete
                            options={[
                              {
                                label: "意大利杰弗伦",
                                value: "意大利杰弗伦",
                              },
                            ]}
                          />
                        </Form.Item>
                      </Col>
                    )}
                    <Col xs={12} md={12}>
                      <Form.Item
                        label="泵后控制系统"
                        name="postPumpControlSystem"
                        rules={[
                          { required: true, message: "请输入泵后控制系统" },
                        ]}
                      >
                        <AutoComplete
                          options={[
                            {
                              label: "泵后国产压力传感器",
                              value: "泵后国产压力传感器",
                            },
                            {
                              label: "泵后进口压力传感器",
                              value: "泵后进口压力传感器",
                            },
                            { label: "NA", value: "NA" },
                          ]}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={12} md={8}>
                      <Form.Item
                        label="变频调速器功率"
                        name="vfdPower"
                        rules={[
                          { required: true, message: "请输入变频调速器功率" },
                        ]}
                        initialValue=""
                      >
                        <InputNumber
                          formatter={(value) => `${value}KW`}
                          parser={(value) => value?.replace(/KW/g, "") as any}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={12} md={8}>
                      <Form.Item
                        label="变频调速器品牌"
                        name="vfdBrand"
                        rules={[{ required: true, message: "请输入品牌" }]}
                        initialValue=""
                      >
                        <AutoComplete
                          options={[
                            {
                              label: "日本富士",
                              value: "日本富士",
                            },
                            {
                              label: "安川",
                              value: "安川",
                            },
                          ]}
                        />
                      </Form.Item>
                    </Col>
                  </>
                )
              );
            }}
          </Form.Item>
        </Row>
      </TailCard>
    </>
  );
};
