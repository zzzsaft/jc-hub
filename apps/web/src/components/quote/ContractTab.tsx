import React from "react";
import { Form, Switch, Button, Row, Col, Input } from "@/components/ui/core";
import TermsTable from "./TermsTable";
import { Clause } from "@/types/types";

interface ContractTabProps {
  value: Clause[];
  onChange: (terms: Clause[]) => void;
  onSetDefault: () => void;
}

const ContractTab: React.FC<ContractTabProps> = ({
  value,
  onChange,
  onSetDefault,
}) => {
  return (
    <>
      <Form.Item name="useCompanyContract" label="是否使用公司合同" valuePropName="checked">
        <Switch />
      </Form.Item>
      <Row gutter={16}>
        <Col span={24}>
          <Form.Item name={["companyInfo", "companyAddress"]} label="单位地址">
            <Input />
          </Form.Item>
        </Col>
        <Col xs={12} md={12}>
          <Form.Item name={["companyInfo", "legalPersonName"]} label="法定代表人">
            <Input />
          </Form.Item>
        </Col>
        <Col xs={12} md={12}>
          <Form.Item name={["companyInfo", "authorizedPerson"]} label="委托代表人">
            <Input />
          </Form.Item>
        </Col>
        <Col xs={12} md={12}>
          <Form.Item name={["companyInfo", "bankName"]} label="开户银行">
            <Input />
          </Form.Item>
        </Col>
        <Col xs={12} md={12}>
          <Form.Item name={["companyInfo", "bankAccount"]} label="账号">
            <Input />
          </Form.Item>
        </Col>
        <Col xs={12} md={12}>
          <Form.Item name={["companyInfo", "postalCode"]} label="邮政编码">
            <Input />
          </Form.Item>
        </Col>
      </Row>
      <Button type="dashed" onClick={onSetDefault} style={{ marginBottom: 16 }}>
        设置默认条款
      </Button>
      <TermsTable value={value} onChange={onChange} />
    </>
  );
};

export default ContractTab;
