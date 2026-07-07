import { IntervalInput } from "@/components/general/IntervalInput";
import TailForm from "@/components/ui/proForm";
import { AutoComplete, Col, Form, InputNumber, Row, Select } from "@/components/ui/core";
import { DefaultOptionType } from "@/components/ui/types";

export const ExtruderFormItem = ({ items }: { items: string[] }) => {
  return (
    <Row gutter={16}>
      <Col xs={4} sm={3}>
        {/* 1. 层级 (AutoComplete) */}
        <TailForm.Item
          name={"layer"}
          label="层"
          rules={[{ required: true, message: "请选择层" }]}
        >
          <AutoComplete
            // disabled={true}
            options={["A", "B", "C", "D", "E", "F"].map((item) => ({
              value: item,
              label: item,
            }))}
            placeholder="层"
            filterOption={(inputValue, option) =>
              option!.value.toUpperCase().indexOf(inputValue.toUpperCase()) !==
              -1
            }
          />
        </TailForm.Item>
      </Col>
      <Col xs={10} sm={5}>
        <TailForm.Item
          name={"material"}
          label="原料"
          rules={[{ required: true, message: "请选择原料" }]}
          initialValue={items?.[0]}
        >
          <Select
            options={items.map((item) => ({
              label: item,
              value: item,
            }))}
          />
        </TailForm.Item>
      </Col>

      <Col xs={10} sm={5}>
        <TailForm.Item name="diameter" label="直径">
          <InputNumber addonBefore="Φ" min={0} precision={0} controls={false} />
        </TailForm.Item>
      </Col>
      <Col xs={12} sm={5}>
        <TailForm.Item
          name="extruderModel"
          label="挤出机型号"
          rules={[{ required: true, message: "请选择挤出机型号" }]}
          initialValue="单螺杆挤出机"
        >
          <AutoComplete
            options={[
              { label: "单螺杆挤出机", value: "单螺杆挤出机" },
              { label: "双螺杆挤出机", value: "双螺杆挤出机" },
            ]}
          />
        </TailForm.Item>
      </Col>
      <Col xs={12} sm={5}>
        <TailForm.Item name="output" label="产量">
          <IntervalInput unit={"kg/h"} />
        </TailForm.Item>
      </Col>
    </Row>
  );
};
