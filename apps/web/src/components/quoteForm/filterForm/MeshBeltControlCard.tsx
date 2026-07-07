import { TailCard } from "@/components/ui/proComponents";
import { AutoComplete, Col, Form, InputNumber, Radio, Row } from "@/components/ui/core";
import TailFormListWrapper from "../formComponents/TailFormListWrapper";
import MeshBeltSpecItem from "../formComponents/MeshBeltSpecItem";

const MeshBeltControlCard: React.FC = () => {
  return (
    <Form.Item noStyle dependencies={["name"]}>
      {({ getFieldValue }) => {
        const name = getFieldValue("name") as string;
        if (!name?.includes("走带式")) return null;
        return (
          <TailCard
            title="配套设置"
            collapsible
            defaultCollapsed={false}
            style={{ marginBottom: 16 }}
            headerBordered
          >
            <Row gutter={16}>
              <Col xs={12} md={6}>
                <Form.Item
                  label="是否配套网带"
                  name="meshBelt"
                  rules={[{ required: true, message: "请选择是否配套网带" }]}
                  initialValue={false}
                >
                  <Radio.Group>
                    <Radio value={true}>是</Radio>
                    <Radio value={false}>否</Radio>
                  </Radio.Group>
                </Form.Item>
              </Col>
              <Form.Item noStyle dependencies={["meshBelt", "model"]}>
                {({ getFieldValue }) => {
                  if (!getFieldValue("meshBelt")) return null;
                  const model = getFieldValue("model") as string;
                  const match = /([0-9]+)(?!.*[0-9])/.exec(model ?? "");
                  const width = match ? Number(match[1]) + 6 : undefined;
                  return (
                    <Col span={24}>
                      <TailFormListWrapper
                        name="meshBeltSpec"
                        label="网带规格"
                        isHorizontal
                        initialValue={[{ mesh: 120, length: 10, width, quantity: 1 }]}
                        creatorRecord={{ mesh: 120, length: 10, width, quantity: 1 }}
                        formItems={<MeshBeltSpecItem />}
                      />
                    </Col>
                  );
                }}
              </Form.Item>
              <Col xs={12} md={6}>
                <Form.Item
                  label="是否配套控制系统"
                  name="controlSystemEnable"
                  rules={[{ required: true, message: "请选择是否配套控制系统" }]}
                  initialValue={false}
                >
                  <Radio.Group>
                    <Radio value={true}>是</Radio>
                    <Radio value={false}>否</Radio>
                  </Radio.Group>
                </Form.Item>
              </Col>
              <Form.Item noStyle dependencies={["controlSystemEnable"]}>
                {({ getFieldValue }) =>
                  getFieldValue("controlSystemEnable") ? (
                    <Col xs={12} md={6}>
                      <Form.Item
                        name="controlSystemCount"
                        label="控制系统数量"
                        rules={[{ required: true, message: "请输入数量" }]}
                        initialValue={1}
                      >
                        <InputNumber min={1} addonAfter="套" style={{ width: "100%" }} />
                      </Form.Item>
                    </Col>
                  ) : (
                    <Col xs={12} md={6}>
                      <Form.Item
                        name="controlSystem"
                        label="控制系统"
                        rules={[{ required: true, message: "请输入控制系统" }]}
                        initialValue="由需方自配"
                      >
                        <AutoComplete options={[{ label: "由需方自配", value: "由需方自配" }]} />
                      </Form.Item>
                    </Col>
                  )
                }
              </Form.Item>
            </Row>
          </TailCard>
        );
      }}
    </Form.Item>
  );
};

export default MeshBeltControlCard;
