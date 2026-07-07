import React from "react";
import { Button, Row, Col, Form, InputNumber, DatePicker } from "@/components/ui/core";
import TermsTable from "./TermsTable";
import { Clause } from "@/types/types";

interface QuoteTermsTabProps {
  value: Clause[];
  onChange: (terms: Clause[]) => void;
  onSetDefault: () => void;
}

const QuoteTermsTab: React.FC<QuoteTermsTabProps> = ({
  value,
  onChange,
  onSetDefault,
}) => {
  return (
    <>
      <Form.Item name="quoteTerms" noStyle hidden />
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}>
          <Form.Item
            name="quoteTime"
            label="报价时间"
            rules={[{ required: true, message: "请选择报价时间" }]}
          >
            <DatePicker
              style={{ width: "100%" }}
              // onChange={onDateChange}
            />
          </Form.Item>
        </Col>
        <Col xs={12} md={6}>
          <Form.Item
            name="quoteValidDays"
            label="报价有效期（天）"
            initialValue={30}
          >
            <InputNumber min={1} style={{ width: "100%" }} />
          </Form.Item>
        </Col>
        {/* <Col xs={12} md={6}>
          <Form.Item name="quoteDeadline" label="报价截止日期">
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>
        </Col> */}
      </Row>
      <Button type="dashed" onClick={onSetDefault} style={{ marginBottom: 16 }}>
        设置默认条款
      </Button>
      <TermsTable value={value} onChange={onChange} />
    </>
  );
};

export default QuoteTermsTab;
