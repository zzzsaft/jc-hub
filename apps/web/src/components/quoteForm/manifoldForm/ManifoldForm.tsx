import {
  Button,
  Col,
  Form,
  FormInstance,
  Input,
  InputNumber,
  Row,
  Select,
  Typography,
} from "@/components/ui/core";
import { TailCard, TailFormDependency } from "@/components/ui/proComponents";
import TailForm from "@/components/ui/proForm";
import { forwardRef, useImperativeHandle, useState } from "react";
import { useQuoteStore } from "@/store/useQuoteStore";
import ImportProductModal from "@/components/quote/productConfigForm/ImportProductModal";
import MaterialSelect from "@/components/general/MaterialSelect";
import AutoSlashInput from "@/components/general/AutoSlashInput";
import TailFormListWrapper from "../formComponents/TailFormListWrapper";
import RunnerLayerItem from "../formComponents/RunnerLayerItem";
import { HeatingMethodSelect } from "../formComponents/HeatingMethodInput";
import PowerFormItem from "../formComponents/PowerFormItem";
import { CustomSelect } from "@/components/general/CustomSelect";
import { MATERIAL_OPTIONS } from "@/utils/material";
import { IntervalInputFormItem } from "@/components/general/IntervalInput";

interface PriceFormRef {
  form: FormInstance;
}

export interface ManifoldFormProps {
  quoteId?: number;
  quoteItemId?: number;
  readOnly?: boolean;
}

const options = [
  { label: "需方客户提供图纸", value: "需方客户提供图纸" },
  { label: "供方精诚设计图纸", value: "供方精诚设计图纸" },
  { label: "按原图纸", value: "按原图纸" },
];

const ManifoldForm = forwardRef(
  (
    {
      quoteId,
      quoteItemId,
      readOnly = false,
    }: { quoteId: number; quoteItemId: number; readOnly?: boolean },
    ref
  ) => {
    const [form] = Form.useForm();
    const [modalOpen, setModalOpen] = useState(false);
    const [ratioUnit, setRatioUnit] = useState<string>(":");
    const a = useQuoteStore.getState().quotes;
    const quoteItems =
      useQuoteStore.getState().quotes.find((q) => q.id === quoteId)?.items ??
      [];
    const findItemById = useQuoteStore.getState().findItemById;
    const currentItem = findItemById(quoteItems, quoteItemId);
    const linkedName = currentItem?.linkId
      ? findItemById(quoteItems, currentItem.linkId)?.productName
      : undefined;
    const isLinked = !!currentItem?.linkId;

    useImperativeHandle(ref, () => ({
      form,
    }));

    const handleImport = (item: any) => {
      if (item?.config) {
        const {
          material,
          temperature,
          runnerNumber,
          compositeStructure,
          runnerLayers,
        } = item.config as any;
        form.setFieldsValue({
          material: material,
          temperature: temperature,
          runnerNumber: runnerNumber,
          compositeStructure: compositeStructure,
          runnerLayers: runnerLayers,
        });
        if (runnerLayers && runnerLayers.length) {
          const u = runnerLayers[0]?.ratio?.unit;
          if (u) setRatioUnit(u);
        }
      }
      setModalOpen(false);
    };

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
      <TailCard
        title="合流器配置"
        // collapsible
        defaultCollapsed={false}
        style={{ marginBottom: 16 }}
        headerBordered
      >
        <TailForm
          layout="vertical"
          form={form}
          submitter={false}
          preserve={false}
        >
          {linkedName && (
            <Typography.Text
              type="secondary"
              style={{ display: "block", marginBottom: 16 }}
            >
              关联产品：{linkedName}
            </Typography.Text>
          )}
          {isLinked ? (
            <Row gutter={16}>
              <Col xs={12} md={6}>
                <Form.Item
                  label="合流器加热分区"
                  name="heatingZone"
                  rules={[{ required: true, message: "请输入合流器加热分区" }]}
                >
                  <InputNumber min={0} style={{ width: "100%" }} />
                </Form.Item>
              </Col>
              <Col xs={12} md={6}>
                <Form.Item
                  label="合流器图纸"
                  name="blueprint"
                  rules={[{ required: true, message: "请选择合流器图纸" }]}
                >
                  <Select options={options} allowClear />
                </Form.Item>
              </Col>
            </Row>
          ) : (
            <>
              <Row gutter={16} style={{ marginBottom: 16 }}>
                <Col xs={24} md={12}>
                  <Form.Item
                    label="是否与模头互配"
                    colon={false}
                    style={{ marginBottom: 0 }}
                  >
                    <Button onClick={() => setModalOpen(true)}>
                      选择模头编号
                    </Button>
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={16}>
                <Col xs={12} md={6}>
                  <Form.Item
                    label="合流器加热分区"
                    name="heatingZone"
                    rules={[
                      { required: true, message: "请输入合流器加热分区" },
                    ]}
                  >
                    <InputNumber min={0} style={{ width: "100%" }} />
                  </Form.Item>
                </Col>
                <Col xs={12} md={6}>
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
                  label="加热电压"
                />
                <Col xs={24} md={19}>
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
                    name="temperature"
                    label="工艺温度(℃)"
                    rules={[{ required: true, message: "请输入工艺温度" }]}
                    placeholder={"工艺温度"}
                    unit="℃"
                  />
                </Col>
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
                    name="manifoldMaterial"
                    label="合流器材料"
                    initialValue="3Cr13"
                    rules={[{ required: true, message: "请选择材料" }]}
                  >
                    <CustomSelect initialGroups={MATERIAL_OPTIONS} />
                  </Form.Item>
                </Col>
                <Col xs={12} md={6}>
                  <Form.Item name="extruder" label="挤出机分布">
                    <Input />
                  </Form.Item>
                </Col>
                <Col xs={12} md={6}>
                  <Form.Item
                    label="合流器图纸"
                    name="blueprint"
                    rules={[{ required: true, message: "请选择合流器图纸" }]}
                  >
                    <Select options={options} allowClear />
                  </Form.Item>
                </Col>
              </Row>
            </>
          )}
        </TailForm>
        <ImportProductModal
          open={modalOpen}
          onCancel={() => setModalOpen(false)}
          onImport={handleImport}
          formType="DieForm"
          orderOnly
        />
      </TailCard>
    );
  }
);

export default ManifoldForm;
