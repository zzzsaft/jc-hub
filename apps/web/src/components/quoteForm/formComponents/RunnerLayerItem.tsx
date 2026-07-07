import TailForm from "@/components/ui/proForm";
import { Col, Row, Input, InputNumber, Select } from "@/components/ui/core";
import { IntervalInput } from "@/components/general/IntervalInput";
import MaterialSelect from "@/components/general/MaterialSelect";

interface RunnerLayerItemProps {
  /** 可选材料列表 */
  materials?: string[];
  ratioUnit?: string;
  onRatioUnitChange?: (unit: string) => void;
}
const RunnerLayerItem: React.FC<RunnerLayerItemProps> = ({
  materials,
  ratioUnit = ":",
  onRatioUnitChange,
}) => {
  return (
    <Row gutter={16}>
      <Col xs={4} md={2}>
        <TailForm.Item name="level" label="层" readOnly>
          <Input disabled />
        </TailForm.Item>
      </Col>
      <Col xs={8} md={6}>
        <TailForm.Item
          name="ratio"
          label="比例"
          rules={[
            {
              validator: async (
                _: any,
                value: { value?: string; front?: number; rear?: number }
              ) => {
                const num = parseFloat(value?.value || "0");
                if (isNaN(num) || num === 0) {
                  return Promise.reject(new Error("比例不得为0"));
                }
                if (
                  (value?.front !== undefined && value.front >= 100) ||
                  (value?.rear !== undefined && value.rear >= 100)
                ) {
                  return Promise.reject(new Error("比例不得超过100"));
                }
                if (
                  value?.front !== undefined &&
                  value?.rear !== undefined &&
                  value.front >= value.rear
                ) {
                  return Promise.reject(new Error("第一个应比第二个小"));
                }
                return Promise.resolve();
              },
            },
          ]}
        >
          <IntervalInput
            unit={ratioUnit}
            units={[":", "%"]}
            style={{ width: 120 }}
            onChange={(v) => {
              if (v.unit !== ratioUnit) onRatioUnitChange?.(v.unit);
            }}
          />
        </TailForm.Item>
      </Col>
      <Col xs={8} md={6}>
        <TailForm.Item
          name="temperature"
          label="工艺温度(℃)"
          rules={[{ required: true, message: "请输入工艺温度" }]}
        >
          <IntervalInput unit="℃" />
        </TailForm.Item>
      </Col>
      <Col xs={8} md={10}>
        <TailForm.Item
          name="material"
          label="材料"
          rules={[{ required: true, message: "请选择材料" }]}
        >
          <Select
            options={materials?.map((item) => ({
              label: item,
              value: item,
            }))}
            placeholder="请选择材料"
          />
        </TailForm.Item>
      </Col>
    </Row>
  );
};

export default RunnerLayerItem;
