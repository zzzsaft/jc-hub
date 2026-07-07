import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Form, Input, Tabs, Select } from "@/components/ui/core";
import MaterialSelect from "../general/MaterialSelect";
import { CustomSelect } from "../general/CustomSelect";

import { getFormByCategory } from "../quote/productConfigForm/formSelector";

import { QuoteTemplate } from "@/types/types";
import TextArea from "@/components/ui/TextArea";

export interface TemplateCreateRef {
  getData: () => Promise<Partial<QuoteTemplate>>;
  reset: () => void;
}

interface TemplateCreateProps {
  initialValues?: Partial<QuoteTemplate>;
  formType?: string;
}

const INDUSTRY = {
  新能源及储能: ["动力电池（锂电、氢燃料、钠电）", "光伏新能源"],
  半导体及电子元器件: ["半导体（泛半导体）", "先进封装", "高端显示"],
  消费电子: ["消费电子"],
  医疗及环保: ["医疗卫生", "环保行业"],
  工业制造及材料: ["新型建材", "包装行业"],
};

const FORM_TYPE_OPTIONS = [
  { label: "平模", value: "DieForm" },
  { label: "智能调节器", value: "SmartRegulator" },
  { label: "熔体计量泵", value: "MeteringPumpForm" },
  { label: "共挤复合分配器", value: "FeedblockForm" },
  { label: "过滤器", value: "FilterForm" },
  { label: "测厚仪", value: "ThicknessGaugeForm" },
  { label: "液压站", value: "HydraulicStationForm" },
  { label: "合流器", value: "ManifoldForm" },
  { label: "涂布模头", value: "CoatingDieForm" },
  { label: "物料", value: "PartsForm" },
  { label: "其他", value: "OtherForm" },
];

const TemplateCreate = forwardRef<TemplateCreateRef, TemplateCreateProps>(
  ({ initialValues, formType: fixedFormType }, ref) => {
    const [infoForm] = Form.useForm();
    const configRef = useRef<any>(null);
    const [formType, setFormType] = useState(
      fixedFormType || initialValues?.templateType || FORM_TYPE_OPTIONS[0].value
    );

    useEffect(() => {
      if (initialValues) {
        infoForm.setFieldsValue({
          name: initialValues.name,
          materials: initialValues.materials,
          industries: initialValues.industries,
          templateType: fixedFormType || initialValues.templateType,
        });
        if (initialValues.templateType) {
          setFormType(fixedFormType || initialValues.templateType);
        }
      }
    }, [initialValues, fixedFormType]);

    useImperativeHandle(ref, () => ({
      async getData() {
        const base = await infoForm.validateFields();
        const config = configRef.current?.form?.getFieldsValue?.() || {};

        return {
          ...initialValues,
          ...base,
          templateType: formType,
          config,
        } as Partial<QuoteTemplate>;
      },
      reset() {
        infoForm.resetFields();
        configRef.current?.form?.resetFields?.();
        setFormType(fixedFormType || FORM_TYPE_OPTIONS[0].value);
      },
    }));

    return (
      <Tabs
        defaultActiveKey="info"
        items={[
          {
            key: "info",
            label: "基本信息",
            forceRender: true,
            children: (
              <Form form={infoForm} layout="vertical">
                <Form.Item
                  label="名称"
                  name="name"
                  rules={[{ required: true, message: "请输入名称" }]}
                >
                  <Input />
                </Form.Item>
                <Form.Item
                  label="描述"
                  name="description"
                  rules={[{ required: true, message: "请输入描述" }]}
                >
                  <TextArea />
                </Form.Item>
                <Form.Item label="适用材料" name="materials">
                  <MaterialSelect />
                </Form.Item>
                <Form.Item label="行业" name="industries">
                  <CustomSelect
                    mode="multiple"
                    dropdown={false}
                    initialGroups={INDUSTRY}
                  />
                </Form.Item>
                <Form.Item
                  label="类型"
                  name="templateType"
                  rules={[{ required: true, message: "请选择类型" }]}
                >
                  <Select
                    options={FORM_TYPE_OPTIONS}
                    disabled={!!fixedFormType}
                    onChange={(val) => setFormType(val)}
                  />
                </Form.Item>
              </Form>
            ),
          },
          {
            key: "config",
            label: "配置",
            forceRender: true,
            children:
              getFormByCategory(undefined, 0, 0, configRef, formType, false).form,
          },
        ]}
      />
    );
  }
);

export default TemplateCreate;
