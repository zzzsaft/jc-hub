import { TailCard } from "@/components/ui/proComponents";
import {
  AutoComplete,
  Col,
  Form,
  Input,
  Row,
  Select,
  Segmented,
  FormInstance,
} from "@/components/ui/core";
import { FilterProduct } from "@/types/types";

interface Props {
  form: FormInstance;
  filters: FilterProduct[];
}
const FilterSelection = ({ form, filters }: Props) => {
  const nameOptions = Array.from(new Set(filters.map((f) => f.name)))
    .map((n) => ({
      label: n,
      value: n,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return (
    <TailCard
      title="过滤器选型"
      collapsible
      defaultCollapsed={false}
      style={{ marginBottom: 16 }}
      headerBordered
    >
      <Row gutter={16}>
        <Col xs={12} md={12}>
          <Form.Item
            label="过滤器类型"
            name="name"
            rules={[{ required: true, message: "请选择过滤器类型" }]}
          >
            <Select options={nameOptions} allowClear showSearch />
          </Form.Item>
        </Col>
        <Col xs={12} md={12}>
          <Form.Item
            label="是否定制"
            name="isCustomization"
            rules={[{ required: true, message: "请选择是否定制" }]}
            initialValue="常规"
          >
            <Segmented<string> options={["常规", "定制"]} />
          </Form.Item>
        </Col>
        <Form.Item noStyle dependencies={["name", "isCustomization"]}>
          {({ getFieldValue }) => {
            const name = getFieldValue("name");
            const isCustomization = getFieldValue("isCustomization") === "定制";
            let modelOptions = filters
              .filter((f) => f.name === name)
              .map((f) => ({ label: f.model, value: f.model }))
              .sort((a, b) =>
                a.label.localeCompare(b.label, undefined, { numeric: true })
              );

            if (isCustomization) {
              modelOptions = modelOptions.map((o) => ({
                label: o.label + "（定制）",
                value: o.value + "（定制）",
              }));
            }

            return (
              <Col xs={12} md={12}>
                <Form.Item
                  label="型号"
                  name="model"
                  rules={[{ required: true, message: "请选择型号" }]}
                >
                  {isCustomization ? (
                    <AutoComplete options={modelOptions} />
                  ) : (
                    <Select options={modelOptions} allowClear />
                  )}
                </Form.Item>
              </Col>
            );
          }}
        </Form.Item>
        <Form.Item noStyle dependencies={["isCustomization"]}>
          {({ getFieldValue }) => {
            const isCustomization = getFieldValue("isCustomization") === "定制";
            return (
              <>
                <Col xs={12} md={6}>
                  <Form.Item label="过滤网板" name="filterBoard">
                    <Input readOnly={!isCustomization} />
                  </Form.Item>
                </Col>
                <Col xs={12} md={6}>
                  <Form.Item label="产能" name="production">
                    <Input readOnly={!isCustomization} />
                  </Form.Item>
                </Col>
                <Col xs={12} md={12}>
                  <Form.Item label="轮廓尺寸" name="dimension">
                    <Input readOnly={!isCustomization} />
                  </Form.Item>
                </Col>
                <Col xs={12} md={6}>
                  <Form.Item label="重量" name="weight">
                    <Input readOnly={!isCustomization} />
                  </Form.Item>
                </Col>
                <Col xs={12} md={6}>
                  <Form.Item label="过滤直径" name="filterDiameter">
                    <Input readOnly={!isCustomization} />
                  </Form.Item>
                </Col>
                <Col xs={12} md={6}>
                  <Form.Item label="有效过滤面积" name="effectiveFilterArea">
                    <Input readOnly={!isCustomization} />
                  </Form.Item>
                </Col>
                <Col xs={12} md={6}>
                  <Form.Item label="承受压力" name="pressure">
                    <Input readOnly={!isCustomization} />
                  </Form.Item>
                </Col>
              </>
            );
          }}
        </Form.Item>
      </Row>
    </TailCard>
  );
};

export default FilterSelection;
