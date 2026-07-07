import { TailCard, TailFormDependency } from "@/components/ui/proComponents";
import {
  AutoComplete,
  Col,
  Form,
  Input,
  InputNumber,
  Radio,
  Row,
  Segmented,
  Select,
} from "@/components/ui/core";
import { IntervalInputFormItem } from "@/components/general/IntervalInput";
import { useEffect, useState } from "react";
import { MATERIAL } from "@/utils/material";
import MaterialSelect from "@/components/general/MaterialSelect";
import { useProductStore } from "@/store/useProductStore";
import ExtruderForm from "../formComponents/ExtruderForm";

export const ModelSelection = ({
  temperatureRequired = true,
}: {
  temperatureRequired?: boolean;
}) => {
  const pump = useProductStore((state) => state.pump);
  const fetchPump = useProductStore((state) => state.fetchPump);
  useEffect(() => {
    if (pump.length == 0) {
      fetchPump();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [runnerType, setRunnerType] = useState("");
  const [material, setMaterial] = useState([""]);

  return (
    <>
      <TailCard
        title="计量泵型号选择"
        collapsible
        defaultCollapsed={false}
        style={{ marginBottom: 16 }}
        headerBordered
      >
        <Row gutter={16}>
          <Col xs={12} md={12}>
            {/* 适用原料 */}
            <Form.Item
              name="material"
              label="适用原料"
              rules={[{ required: true, message: "请选择适用原料" }]}
            >
              <MaterialSelect
                onChange={(value) => {
                  setMaterial(Array.isArray(value) ? value : [value]);
                }}
              />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <IntervalInputFormItem
              name="temperature"
              label="工艺温度(℃)"
              rules={
                temperatureRequired
                  ? [{ required: true, message: "请输入工艺温度" }]
                  : []
              }
              placeholder={"工艺温度"}
              addonAfter="℃"
            />
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              label="类型"
              name="type"
              rules={[{ required: true, message: "请选择类型" }]}
              initialValue="普通计量泵"
            >
              <Segmented<string> options={["普通计量泵", "内冷式计量泵"]} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              label="材料特性"
              name="shearSensitivity"
              rules={[{ required: true, message: "请选择材料特性" }]}
              initialValue="低剪切敏感度"
            >
              <Segmented<string>
                options={["低剪切敏感度", "中剪切敏感度", "高剪切敏感度"]}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              label="是否定制"
              name="isCustomization"
              rules={[{ required: true, message: "请选择是否定制" }]}
              initialValue="常规"
            >
              <Segmented<string> options={["常规", "定制"]} />
            </Form.Item>
          </Col>
          <Form.Item noStyle dependencies={["type", "isCustomization"]}>
            {({ getFieldValue }) => {
              const type = getFieldValue("type");
              const isCustomization =
                getFieldValue("isCustomization") == "定制";
              let option = [...new Set(pump.map((p) => p.model))].map(
                (model) => ({ label: model, value: model })
              );
              if (type == "内冷式计量泵") {
                option = option.map((o) => ({
                  label: o.label + "-NL",
                  value: o.value + "-NL",
                }));
              }
              if (isCustomization) {
                option = option.map((o) => ({
                  label: o.label + "（定制）",
                  value: o.value + "（定制）",
                }));
              }

              return (
                <>
                  <Col xs={24} md={12}>
                    <Form.Item
                      label="型号"
                      name="model"
                      rules={[{ required: true, message: "请选择型号" }]}
                    >
                      {isCustomization ? (
                        <AutoComplete options={option} />
                      ) : (
                        <Select options={option} />
                      )}
                    </Form.Item>
                  </Col>
                  <Col xs={12} md={6}>
                    <IntervalInputFormItem
                      label="排量"
                      name="pumpage"
                      unit="cm³/rev"
                      readOnly={!isCustomization}
                      style={{ width: "100%" }}
                    />
                  </Col>
                  <Col xs={12} md={6}>
                    <IntervalInputFormItem
                      label="转速"
                      name="rotateSpeed"
                      unit="rpm"
                      readOnly={!isCustomization}
                      style={{ width: "100%" }}
                    />
                  </Col>
                  <Col xs={12} md={6}>
                    <IntervalInputFormItem
                      label="产量"
                      name="production"
                      unit="kg/h"
                      readOnly={!isCustomization}
                      style={{ width: "100%" }}
                    />
                  </Col>
                  <Col xs={12} md={6}>
                    <IntervalInputFormItem
                      label="加热功率"
                      name="heatingPower"
                      unit="kw"
                      readOnly={!isCustomization}
                      style={{ width: "100%" }}
                    />
                  </Col>
                </>
              );
            }}
          </Form.Item>
        </Row>
        {/* <Row gutter={16}>
          <Col xs={12} md={6}>
            <Form.Item label="排量" name="pumpage">
              <Input readOnly />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item label="转速" name="rotateSpeed">
              <Input readOnly />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item label="产量" name="production">
              <Input readOnly />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item label="加热功率" name="heatingPower">
              <Input readOnly />
            </Form.Item>
          </Col>

          <ExtruderForm items={material} />
        </Row> */}
      </TailCard>
    </>
  );
};
