import {
  TailCard,
  TailForm,
  TailFormDependency,
} from "@/components/ui/proComponents";
import {
  Col,
  Form,
  Input,
  InputNumber,
  Radio,
  Row,
  Cascader,
  Select,
} from "@/components/ui/core";
import { IntervalInputFormItem } from "@/components/general/IntervalInput";
import ScrewForm from "../formComponents/ScrewForm";
import AutoSlashInput from "@/components/general/AutoSlashInput";
import TailFormListWrapper from "../formComponents/TailFormListWrapper";

import MaterialSelect from "@/components/general/MaterialSelect";
import RunnerLayerItem from "../formComponents/RunnerLayerItem";
import { useState } from "react";

const RUNNER_TYPE_OPTIONS = [
  {
    value: "单腔流道",
    label: "单腔流道",
    children: [
      { value: "衣架式", label: "衣架式" },
      { value: "特殊支管式", label: "特殊支管式" },
      { value: "PVB专用流道", label: "PVB专用流道" },
      { value: "TPU专用流道", label: "TPU专用流道" },
      { value: "EVA专用流道", label: "EVA专用流道" },
      { value: "中空专用流道", label: "中空专用流道" },
    ],
  },
  {
    value: "多腔流道",
    label: "多腔流道",
  },
];

const EXTRUDE_TYPE_OPTIONS = [
  { value: "单层挤出", label: "单层挤出" },
  { value: "模内共挤", label: "模内共挤" },
  { value: "分配器共挤", label: "分配器共挤" },
  { value: "分配器+模内共挤", label: "分配器+模内共挤" },
];
export const Product = () => {
  const form = Form.useFormInstance();
  const [ratioUnit, setRatioUnit] = useState<string>(":");

  const handleRatioUnitChange = (unit: string) => {
    setRatioUnit(unit);
    const list = (form.getFieldValue("runnerLayers") || []) as any[];
    form.setFieldValue(
      "runnerLayers",
      list.map((item) => ({
        ...item,
        ratio: { ...(item.ratio || {}), unit },
      }))
    );
  };
  return (
    <>
      <TailCard
        title="制品信息"
        collapsible
        defaultCollapsed={false}
        style={{ marginBottom: 16 }}
        headerBordered
      >
        <Form.Item
          label="请选择原料来源"
          name="materialSource"
          rules={[{ required: true, message: "请选择原料来源" }]}
        >
          <Radio.Group>
            <Radio value={"乙方提供各原料样品流变曲线"}>
              乙方提供各原料样品流变曲线
            </Radio>
            <Radio value={"甲方提供各原料样品500g供乙方检测"}>
              甲方提供各原料样品500g供乙方检测
            </Radio>
            <Radio value={"NA"}>无需提供</Radio>
          </Radio.Group>
        </Form.Item>

        <Row gutter={16}>
          <Col xs={24} md={19}>
            {/* 适用原料 */}
            <Form.Item
              name="material"
              label="适用原料"
              rules={[{ required: true, message: "请选择适用原料" }]}
            >
              <MaterialSelect />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <IntervalInputFormItem
              name="productWidth"
              label="制品宽度(mm)"
              dependencies={["dieWidth"]}
              rules={[
                {
                  validator: (_, value) => {
                    const other = form.getFieldValue("dieWidth");
                    if (!value?.value && !other?.value) {
                      return Promise.reject(
                        new Error("口模有效宽度和制品宽度至少要填一个")
                      );
                    }
                    return Promise.resolve();
                  },
                },
              ]}
              placeholder={"制品宽度"}
              unit="mm"
            />
          </Col>
          <Col xs={12} md={6}>
            <IntervalInputFormItem
              name="dieWidth"
              label="口模有效宽度(mm)"
              dependencies={["productWidth"]}
              rules={[
                {
                  validator: (_, value) => {
                    const other = form.getFieldValue("productWidth");
                    if (!value?.value && !other?.value) {
                      return Promise.reject(
                        new Error("口模有效宽度和制品宽度至少要填一个")
                      );
                    }
                    return Promise.resolve();
                  },
                },
              ]}
              placeholder={"有效宽度"}
              unit="mm"
              // addonAfter="mm"
              isSecondNumberGreater={false}
            />
          </Col>
          <Col xs={12} md={6}>
            <IntervalInputFormItem
              name="thickness"
              label="制品厚度(mm)"
              dependencies={["lipOpening", "lipCount"]}
              rules={[
                {
                  validator: (_, value) => {
                    const lipCount = form.getFieldValue("lipCount");
                    if (lipCount > 1) return Promise.resolve();
                    const other = form.getFieldValue("lipOpening");
                    if (!value?.value && !other?.value) {
                      return Promise.reject(
                        new Error("制品厚度和模唇开口至少要填一个")
                      );
                    }
                    return Promise.resolve();
                  },
                },
              ]}
              placeholder={"有效厚度"}
              unit="mm"
            />
          </Col>
          <Col xs={12} md={6}>
            <IntervalInputFormItem
              name="lipOpening"
              label="模唇开口(mm)"
              dependencies={["thickness", "lipCount"]}
              rules={[
                {
                  validator: (_, value) => {
                    const lipCount = form.getFieldValue("lipCount");
                    if (lipCount > 1) return Promise.resolve();
                    const other = form.getFieldValue("thickness");
                    if (!value?.value && !other?.value) {
                      return Promise.reject(
                        new Error("制品厚度和模唇开口至少要填一个")
                      );
                    }
                    return Promise.resolve();
                  },
                },
              ]}
              placeholder={"模唇开口"}
              unit="mm"
            />
          </Col>
          <Form.Item noStyle dependencies={["runnerNumber"]}>
            {({ getFieldValue }) =>
              getFieldValue("runnerNumber") > 1 ? null : (
                <Col xs={12} md={6}>
                  <IntervalInputFormItem
                    name="production"
                    label="适用产量"
                    rules={[{ required: true, message: "请输入适用产量范围" }]}
                    placeholder={"产量"}
                    units={["kg/h", "l/h"]}
                  />
                </Col>
              )
            }
          </Form.Item>

          <Form.Item noStyle dependencies={["runnerNumber"]}>
            {({ getFieldValue }) =>
              getFieldValue("runnerNumber") > 1 ? null : (
                <Col xs={12} md={6}>
                  <IntervalInputFormItem
                    name="temperature"
                    label="工艺温度(℃)"
                    rules={[{ required: true, message: "请输入工艺温度" }]}
                    placeholder={"工艺温度"}
                    unit="℃"
                  />
                </Col>
              )
            }
          </Form.Item>
          <Col xs={12} md={6}>
            {/* 流道形式 */}
            <Form.Item
              name="runnerType"
              label="流道形式"
              rules={[{ required: true, message: "请选择流道形式" }]}
            >
              <Cascader
                options={RUNNER_TYPE_OPTIONS}
                placeholder="请选择"
                changeOnSelect
              />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            {/* 挤出类型 */}
            <Form.Item
              name="extrudeType"
              label="挤出类型"
              rules={[{ required: true, message: "请选择挤出类型" }]}
            >
              <Select options={EXTRUDE_TYPE_OPTIONS} placeholder="请选择" />
            </Form.Item>
          </Col>
          <Form.Item noStyle dependencies={["extrudeType"]}>
            {({ getFieldValue }) =>
              ["模内共挤", "分配器+模内共挤"].includes(
                getFieldValue("extrudeType")
              ) ? (
                <>
                  <Col xs={12} md={6}>
                    <Form.Item
                      name="runnerNumber"
                      label="层数"
                      rules={[{ required: true, message: "请输入层数" }]}
                    >
                      <InputNumber min={2} max={6} style={{ width: "100%" }} />
                    </Form.Item>
                  </Col>
                  <Col xs={12} md={6}>
                    <Form.Item
                      name="compositeStructure"
                      label="复合结构"
                      rules={[{ required: true, message: "请输入复合结构" }]}
                    >
                      <AutoSlashInput />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={24}>
                    <TailFormDependency name={["runnerNumber", "material"]}>
                      {({ runnerNumber, material }) => (
                        <TailFormListWrapper
                          name="runnerLayers"
                          label="每层复合比例"
                          canCreate={false}
                          canDelete={false}
                          isHorizontal={false}
                          formItems={
                            <RunnerLayerItem
                              materials={
                                Array.isArray(material) ? material : [material]
                              }
                              ratioUnit={ratioUnit}
                              onRatioUnitChange={handleRatioUnitChange}
                            />
                          }
                          creatorRecord={{ ratio: { unit: ratioUnit } }}
                        />
                      )}
                    </TailFormDependency>
                  </Col>
                  <Col xs={12} md={6}>
                    <Form.Item
                      name="haveThermalInsulation"
                      label="是否选配隔热装置"
                      rules={[{ required: true, message: "是否选配隔热装置" }]}
                    >
                      <Radio.Group>
                        <Radio value={true}>是</Radio>
                        <Radio value={false}>否</Radio>
                      </Radio.Group>
                    </Form.Item>
                  </Col>
                </>
              ) : null
            }
          </Form.Item>
        </Row>
      </TailCard>
      <Form.Item noStyle dependencies={["extrudeType", "material"]}>
        {({ getFieldValue }) =>
          ["模内共挤", "分配器+模内共挤"].includes(
            getFieldValue("extrudeType")
          ) ? (
            <TailCard
              title="螺杆信息"
              collapsible
              defaultCollapsed={false}
              style={{ marginBottom: 16 }}
              headerBordered
            >
              <ScrewForm
                items={
                  Array.isArray(getFieldValue("material"))
                    ? getFieldValue("material")
                    : [getFieldValue("material")]
                }
              />
            </TailCard>
          ) : null
        }
      </Form.Item>
    </>
  );
};
