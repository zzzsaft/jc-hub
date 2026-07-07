import {
  Avatar,
  Button,
  Card,
  Checkbox,
  Col,
  Form,
  Input,
  Radio,
  Row,
} from "@/components/ui/core";
import Layout, { Content } from "@/components/ui/core";
import { SearchOutlined, UserOutlined } from "@/components/ui/icons";
import { CustomerService } from "@/api/services/customer.service";
import { DebounceSelect } from "@/components/general/DebounceSelect";

type ExternalContactBindingFormProps = {
  form: any;
  userContext: any;
  onSubmit: (values: any) => void;
};

export function ExternalContactBindingForm({ form, userContext = {}, onSubmit }: ExternalContactBindingFormProps) {
  return (
    <Layout className="qywx-layout">
      <Content className="form-content-container">
        <Card className="form-card">
          <Form form={form} layout="vertical" onFinish={onSubmit}>
            <Row gutter={16} align="middle" className="user-info-row">
              <Col>
                <Avatar size={64} src={userContext.avatar} icon={<UserOutlined />} />
              </Col>
              <Col>
                <div className="user-info">
                  <div className="user-name">{userContext.name || "未知用户"}</div>
                  {userContext.corp_name && <div className="corp-name">@{userContext.corp_name}</div>}
                </div>
              </Col>
            </Row>

            <Form.Item name="company" label="所属公司" rules={[{ required: true, message: "请选择公司" }]}>
              <DebounceSelect
                fetchOptions={CustomerService.searchCompanies}
                showSearch
                placeholder="搜索并选择公司"
                suffixIcon={<SearchOutlined />}
              />
            </Form.Item>

            <Form.Item name="name" label="客户姓名" rules={[{ required: true, message: "请输入客户姓名" }]}>
              <Input placeholder="请输入客户姓名" />
            </Form.Item>

            <Form.Item name="gender" label="性别" rules={[{ required: true, message: "请选择性别" }]}>
              <Radio.Group>
                <Radio value="male">男</Radio>
                <Radio value="female">女</Radio>
              </Radio.Group>
            </Form.Item>

            <Form.Item
              name="phone"
              label="手机号"
              rules={[
                {
                  pattern: /^1[3-9]\d{9}$/,
                  message: "请输入正确的手机号",
                  validator: (_, value) =>
                    !value || /^1[3-9]\d{9}$/.test(value) || value == ""
                      ? Promise.resolve()
                      : Promise.reject(new Error("请输入正确的手机号")),
                },
              ]}
            >
              <Input placeholder="请输入手机号" />
            </Form.Item>

            <Form.Item style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                <Form.Item name="isKeyDecisionMaker" valuePropName="checked" noStyle>
                  <Checkbox>是否关键决策人</Checkbox>
                </Form.Item>

                <Form.Item name="updateQywxRemark" valuePropName="checked" initialValue={true} noStyle>
                  <Checkbox>是否更新企微备注</Checkbox>
                </Form.Item>
              </div>
            </Form.Item>

            <Form.Item name="position" label="职位">
              <Input placeholder="请输入职位" />
            </Form.Item>

            <Form.Item name="remark" label="备注">
              <Input.TextArea rows={3} placeholder="请输入备注信息" />
            </Form.Item>

            <Form.Item>
              <Button type="primary" htmlType="submit" block size="large">
                绑定客户
              </Button>
            </Form.Item>
          </Form>
        </Card>
      </Content>
    </Layout>
  );
}

