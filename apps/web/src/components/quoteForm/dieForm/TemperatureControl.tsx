import { TailCard } from "@/components/ui/proComponents";
import {
  Checkbox,
  Col,
  Divider,
  Form,
  Input,
  InputNumber,
  Radio,
  Row,
} from "@/components/ui/core";
import { powerInputRules } from "@/utils/rules";
import { PowerInput } from "../formComponents/PowerInput";
import PowerFormItem from "../formComponents/PowerFormItem";
import { HeatingMethodSelect } from "../formComponents/HeatingMethodInput";
import { useState } from "react";
import { TooltipLabel } from "@/components/general/TooltipLabel";

export const TemperatureControl = () => {
  const [hasGlassThermocouple, setHasGlassThermocouple] =
    useState<boolean>(false);
  return (
    <TailCard
      title="温控配置"
      collapsible
      defaultCollapsed={false}
      style={{ marginBottom: 16 }}
      headerBordered
    >
      <Divider>模体加热配置</Divider>
      <Row gutter={16}>
        <Form.Item noStyle dependencies={["temperature"]}>
          {({ getFieldValue }) => {
            const temperature = getFieldValue("temperature");
            return (
              <Col xs={24} sm={12}>
                <Form.Item
                  name="heatingMethod"
                  label={
                    <TooltipLabel
                      label="模体加热方式"
                      tooltip="330以上不可选铸铝加热板"
                    />
                  }
                  // rules={[{ required: true, message: "请选择加热方式" }]}
                >
                  <HeatingMethodSelect
                    multiple={true}
                    temperature={temperature?.value}
                  />
                </Form.Item>
              </Col>
            );
          }}
        </Form.Item>

        <Form.Item noStyle dependencies={["heatingMethod"]}>
          {({ getFieldValue }) => {
            const heatingMethod = getFieldValue("heatingMethod");
            return heatingMethod?.includes("油加温") ? (
              <Col xs={24} sm={12}>
                <Form.Item
                  name="thermostat"
                  label="模温控制器"
                  rules={[
                    { required: true, message: "请选择是否选配温控控制器" },
                  ]}
                >
                  <Radio.Group>
                    <Radio value={true}>选配</Radio>
                    <Radio value={false}>不选配</Radio>
                  </Radio.Group>
                </Form.Item>
              </Col>
            ) : null;
          }}
        </Form.Item>
        <PowerFormItem
          dependencyName="heatingMethod"
          name="powerInput"
          label="加热电压"
          rules={powerInputRules}
          colProps={{ xs: 24, sm: 12 }}
        />
        <Form.Item noStyle dependencies={["heatingMethod"]}>
          {({ getFieldValue }) => {
            const methods = getFieldValue("heatingMethod");
            const show = Array.isArray(methods)
              ? methods.some(
                  (m: string) => m === "加热棒" || String(m).includes("加热板")
                )
              : methods &&
                (methods === "加热棒" || String(methods).includes("加热板"));
            return show ? (
              <Col xs={12} sm={12}>
                <Form.Item
                  name="每区电压"
                  label="每区电压"
                  rules={[{ required: true, message: "请选择热电偶控位" }]}
                  initialValue={"5KW以内"}
                >
                  <Input />
                </Form.Item>
              </Col>
            ) : null;
          }}
        </Form.Item>
        <Col xs={12} sm={12}>
          <Form.Item
            name="thermocoupleHoles"
            label="热电偶孔"
            rules={[{ required: true, message: "请选择热电偶控位" }]}
            initialValue={"有"}
          >
            <Radio.Group>
              <Radio value={"有"}>有</Radio>
              <Radio value={"无"}>无</Radio>
              <Radio value={"自定义"}>自定义</Radio>
            </Radio.Group>
          </Form.Item>
        </Col>
        <Form.Item noStyle dependencies={["thermocoupleHoles"]}>
          {({ getFieldValue }) =>
            getFieldValue("thermocoupleHoles")?.includes("自定义") ? (
              <Col xs={12} sm={12}>
                <Form.Item
                  name="customThermocoupleHoles"
                  label="自定义热电偶孔"
                  rules={[{ required: true, message: "请输入自定义热电偶孔" }]}
                >
                  <Input />
                </Form.Item>
              </Col>
            ) : null
          }
        </Form.Item>
        <Col xs={12} sm={12}>
          {/* 玻璃测温孔 */}
          <Form.Item
            name="glassThermocouple"
            label="玻璃测温孔"
            rules={[{ required: true, message: "请选择有无玻璃测温孔" }]}
          >
            <Radio.Group
              onChange={(e) => setHasGlassThermocouple(e.target.value)}
            >
              <Radio value={true}>有</Radio>
              <Radio value={false}>无</Radio>
            </Radio.Group>
          </Form.Item>
        </Col>
        <Col xs={12} sm={12}>
          {/* 模头加热分区 */}
          <Form.Item
            name="heatingZones"
            label="模头加热分区数量"
            rules={[{ required: true, message: "请输入加热分区数量" }]}
          >
            <InputNumber
              min={0}
              // max={30}
              precision={0}
              style={{ width: "100%" }}
            />
          </Form.Item>
        </Col>
        <Col xs={12} sm={12}>
          {/* 条件渲染 - 玻璃测温孔分区 */}
          {hasGlassThermocouple && (
            <Form.Item
              name="glassHeatingZones"
              label="玻璃测温孔分区"
              rules={[{ required: true, message: "请输入分区数量" }]}
            >
              <InputNumber
                min={0}
                max={30}
                precision={0}
                style={{ width: "100%" }}
              />
            </Form.Item>
          )}
        </Col>
        <Divider>其他加热配置</Divider>
        <Col xs={12} sm={12}>
          {/* 玻璃测温孔 */}
          <Form.Item
            name="sideHeating"
            label="侧板加热"
            rules={[{ required: true, message: "请选择是否侧板加热" }]}
          >
            <Radio.Group>
              <Radio value={true}>有</Radio>
              <Radio value={false}>无</Radio>
            </Radio.Group>
          </Form.Item>
        </Col>
        <Col xs={12} sm={12}>
          {/* 玻璃测温孔 */}
          <Form.Item
            name="lipHeating"
            label="模唇加热"
            rules={[{ required: true, message: "请选择是否模唇加热" }]}
          >
            <Radio.Group>
              <Radio value={true}>有</Radio>
              <Radio value={false}>无</Radio>
            </Radio.Group>
          </Form.Item>
        </Col>
        <Form.Item noStyle dependencies={["lipHeating"]}>
          {({ getFieldValue }) => {
            const lipHeating = getFieldValue("lipHeating");
            const temperature = getFieldValue("temperature");
            return lipHeating ? (
              <Col xs={24} sm={12}>
                <Form.Item name="lipHeatingMethod" label="模唇加热方式">
                  <HeatingMethodSelect
                    multiple={true}
                    temperature={temperature?.value}
                  />
                </Form.Item>
              </Col>
            ) : null;
          }}
        </Form.Item>
      </Row>
    </TailCard>
  );
};
