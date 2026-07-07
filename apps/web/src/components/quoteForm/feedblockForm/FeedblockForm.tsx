import {
  Col,
  Form,
  FormInstance,
  Input,
  InputNumber,
  Radio,
  Row,
  Segmented,
  Select,
  AutoComplete,
} from "@/components/ui/core";

import { forwardRef, useImperativeHandle } from "react";
import TailForm, {
  TailFormDependency,
  TailFormList,
  TailFormText,
} from "@/components/ui/proForm";
import TextArea from "@/components/ui/TextArea";

import MaterialSelect from "@/components/general/MaterialSelect";
import AutoSlashInput from "@/components/general/AutoSlashInput";
import RatioInput from "@/components/general/RatioInput";
import { useQuoteStore } from "@/store/useQuoteStore";
import LevelInputNumber, {
  LevelValue,
} from "@/components/general/LevelInputNumber";
import ExtruderForm from "../formComponents/ExtruderForm";
import { PowerInput } from "../formComponents/PowerInput";
import PowerFormItem from "../formComponents/PowerFormItem";
import { HeatingMethodSelect } from "../formComponents/HeatingMethodInput";
import TailFormListWrapper from "../formComponents/TailFormListWrapper";
import { CustomSelect } from "@/components/general/CustomSelect";
import {
  IntervalInput,
  IntervalInputFormItem,
} from "@/components/general/IntervalInput";
import { MATERIAL_OPTIONS } from "@/utils/material";

interface PriceFormRef {
  form: FormInstance;
}

const FeedblockForm = forwardRef(
  (
    {
      quoteId,
      quoteItemId,
      readOnly = false,
    }: { quoteId: number; quoteItemId: number; readOnly?: boolean },
    ref
  ) => {
    const [form] = Form.useForm();
    const quoteType = useQuoteStore(
      (state) => state.quotes.find((q) => q.id === quoteId)?.type
    );

    useImperativeHandle(ref, () => ({
      form,
    }));

    const countMap: Record<string, number> = {
      两台机: 2,
      三台机: 3,
      四台机: 4,
      五台机: 5,
      六台机: 6,
      七台机: 7,
      八台机: 8,
      九台机: 9,
    };

    const handleFieldsChange = (changedFields: any) => {
      if (changedFields.layers != null) {
        const map: Record<string, string[]> = {
          两层: ["两台机"],
          三层: ["两台机", "三台机"],
          四层: ["两台机", "三台机", "四台机"],
          五层: ["三台机", "四台机", "五台机"],
          七层: ["四台机", "五台机", "六台机", "七台机"],
          九层: ["五台机", "六台机", "七台机", "八台机", "九台机"],
        };
        const opts = map[changedFields.layers as string] || [];
        const current = form.getFieldValue("extruderNumber");
        if (current && !opts.includes(current)) {
          form.setFieldValue("extruderNumber", undefined);
        }
      }
      if (changedFields.extruderNumber != null) {
        const count = countMap[changedFields.extruderNumber as string];
        if (count) {
          const list = (form.getFieldValue("extruderModel") || []) as any[];
          const base = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
          const next = Array.from({ length: count }, (_, i) => ({
            layer: base[i],
          }));
          form.setFieldValue(
            "extruderModel",
            list.slice(0, count).concat(next.slice(list.length))
          );
          form.setFieldValue("screwList", next);
        }
      }

      if (changedFields.compositeList != null) {
        const composite = (form.getFieldValue("compositeList") || []) as any[];
        const updated = composite.map((item: any) => {
          const letters = (item.structure || "")
            .replace(/[^A-Z]/gi, "")
            .split("");
          const ratio = letters.map((l: string, idx: number) => ({
            level: l,
            value: item.ratio?.[idx]?.value,
          }));
          return { ...item, ratio };
        });
        form.setFieldValue("compositeList", updated);
      }
    };

    return (
      <>
        <TailForm
          layout="vertical"
          form={form}
          submitter={false}
          onValuesChange={handleFieldsChange}
        >
          <Row gutter={16}>
            <Col xs={12} md={6}>
              <Form.Item
                name="material"
                label="适用塑料原料"
                rules={[{ required: true, message: "请选择适用原料" }]}
              >
                <MaterialSelect />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item
                name="dieMaterial"
                label="分配器材质"
                rules={[{ required: true, message: "请选择分配器材质" }]}
                initialValue={"3Cr13锻件"}
              >
                <CustomSelect
                  initialGroups={MATERIAL_OPTIONS}
                  dropdown={true}
                  showSearch={false}
                />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <IntervalInputFormItem
                name="production"
                label="分配器产量(kg/h)"
                rules={
                  quoteType !== "history"
                    ? [{ required: true, message: "请输入产量" }]
                    : []
                }
                unit="kg/h"
              />
            </Col>
            <Col xs={24} md={16}>
              <Form.Item
                name="structure"
                label="分配器结构"
                rules={[{ required: true, message: "请选择分配器结构" }]}
              >
                <Radio.Group>
                  <Radio value="镶块式">镶块式</Radio>
                  <Radio value="摆叶式">摆叶式</Radio>
                  <Radio value="芯棒式">芯棒式</Radio>
                  <Radio value="精诚设计">精诚设计</Radio>
                  <Radio value="特殊定制">特殊定制</Radio>
                </Radio.Group>
              </Form.Item>
            </Col>
            <Form.Item noStyle dependencies={["structure"]}>
              {({ getFieldValue }) =>
                getFieldValue("structure") === "特殊定制" ? (
                  <Col xs={24} md={8}>
                    <Form.Item
                      name="customStructure"
                      label="特殊定制说明"
                      rules={[{ required: true, message: "请输入定制内容" }]}
                    >
                      <Input />
                    </Form.Item>
                  </Col>
                ) : null
              }
            </Form.Item>
            <Col xs={24} md={12}>
              <Form.Item
                name="layers"
                label="分配器层数"
                rules={[{ required: true, message: "请选择分配器层数" }]}
                initialValue={"两层"}
              >
                <Segmented<string>
                  options={["两层", "三层", "四层", "五层", "七层", "九层"]}
                />
              </Form.Item>
            </Col>
            <Form.Item noStyle dependencies={["layers"]}>
              {({ getFieldValue }) => {
                const layer = getFieldValue("layers");
                const map: Record<string, string[]> = {
                  两层: ["两台机"],
                  三层: ["两台机", "三台机"],
                  四层: ["两台机", "三台机", "四台机"],
                  五层: ["三台机", "四台机", "五台机"],
                  七层: ["四台机", "五台机", "六台机", "七台机"],
                  九层: ["五台机", "六台机", "七台机", "八台机", "九台机"],
                };
                const opts = map[layer as string] || [];
                return (
                  <Col xs={24} md={12}>
                    <Form.Item
                      name="extruderNumber"
                      label="挤出机数量"
                      rules={[{ required: true, message: "请选择挤出机数量" }]}
                      initialValue={"两台机"}
                    >
                      <Select
                        options={opts.map((i) => ({ label: i, value: i }))}
                      />
                    </Form.Item>
                  </Col>
                );
              }}
            </Form.Item>
            <Col xs={24} md={24}>
              <TailFormListWrapper
                name="compositeList"
                label="层结构及比例"
                rules={[{ required: true, message: "请输入层结构及比例" }]}
                min={1}
                canCreate={true}
                canDelete={true}
                // isHorizontal
                // creatorButtonProps={{
                //   creatorButtonText: "新建",
                //   type: "link",
                //   style: { width: "unset" },
                // }}
                creatorRecord={{ ratio: [] }}
                formItems={
                  <>
                    <TailForm.Item
                      name="structure"
                      rules={[{ required: true, message: "请输入层结构形式" }]}
                    >
                      <AutoSlashInput style={{ width: "120px" }} />
                    </TailForm.Item>
                    <TailFormList
                      name="ratio"
                      copyIconProps={false}
                      deleteIconProps={false}
                      creatorButtonProps={false}
                      itemRender={({ listDom }) => (
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            marginRight: 16,
                            marginBottom: -20,
                          }}
                        >
                          {listDom}
                        </div>
                      )}
                    >
                      <TailForm.Item
                        name={[]}
                        rules={[
                          {
                            validator: async (_: any, value: LevelValue) => {
                              const num = parseFloat(
                                value?.value?.value || "0"
                              );
                              // if (isNaN(num) || num === 0) {
                              //   return Promise.reject(new Error("比例不得为0"));
                              // }
                              if (
                                (value?.value?.front &&
                                  value?.value?.front > 100) ||
                                (value?.value?.rear && value?.value?.rear > 100)
                              ) {
                                return Promise.reject(
                                  new Error("比例不得超过100")
                                );
                              }
                              if (
                                value?.value?.front &&
                                value?.value?.rear &&
                                value?.value?.front >= value?.value?.rear
                              ) {
                                return Promise.reject(
                                  new Error("第一个应比第二个小")
                                );
                              }
                              return Promise.resolve();
                            },
                          },
                        ]}
                      >
                        <LevelInputNumber style={{ width: 120 }} />
                      </TailForm.Item>
                    </TailFormList>
                  </>
                }
              />
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                name="heatingMethod"
                label="加热方式"
                rules={[{ required: true, message: "请选择加热方式" }]}
              >
                <HeatingMethodSelect multiple />
              </Form.Item>
            </Col>
            <PowerFormItem
              dependencyName="heatingMethod"
              name="power"
              label="电压"
              rules={[{ required: true, message: "请输入电压" }]}
            />
            <Col xs={12} md={6}>
              <Form.Item name="heatingPower" label="加热功率">
                <InputNumber
                  controls={false}
                  min={0}
                  // precision={2}
                  style={{ width: "100%" }}
                  formatter={(value) => `${value}kw`}
                  parser={(value) => value?.replace(/kw/g, "") as any}
                />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item
                name="fastener"
                label="紧固件（螺丝）"
                rules={[{ required: true, message: "请选择螺丝" }]}
                initialValue="12.9高强度"
              >
                <AutoComplete
                  options={[{ label: "12.9高强度", value: "12.9高强度" }]}
                />
              </Form.Item>
            </Col>

            <Form.Item noStyle dependencies={["material", "extruderNumber"]}>
              {({ getFieldValue }) => {
                const material = getFieldValue("material");
                const extruderNumber = getFieldValue("extruderNumber");
                return (
                  <Col span={24}>
                    <ExtruderForm
                      items={
                        Array.isArray(material)
                          ? material
                          : material
                          ? [material]
                          : []
                      }
                      count={countMap[extruderNumber as string]}
                      creatorButtonProps={false}
                    />
                  </Col>
                );
              }}
            </Form.Item>
            <Col xs={24} md={12}>
              <Form.Item
                name="extruderOrientation"
                label="挤出机排列方向"
                initialValue="按供方提供图纸确认回传为准"
              >
                <AutoComplete
                  options={[
                    {
                      label: "按供方提供图纸确认回传为准",
                      value: "按供方提供图纸确认回传为准",
                    },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                name="wiredMethod"
                label="接线方式"
                initialValue="专用接线盒封闭接线"
              >
                <AutoComplete
                  options={[
                    {
                      label: "专用接线盒封闭接线",
                      value: "专用接线盒封闭接线",
                    },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="其他备注" name="remark">
            <TextArea />
          </Form.Item>
        </TailForm>
      </>
    );
  }
);

export default FeedblockForm;
