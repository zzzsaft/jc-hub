import {
  Modal,
  Input,
  DatePicker,
  Form,
  Button,
  Row,
  Col,
  App,
  Spin,
} from "@/components/ui/core";
import InputWithButton from "../general/InputWithButton";
import { CustomerService } from "@/api/services/customer.service";
import { OrderService } from "@/api/services/order.service";
import CompanySearchSelect from "../general/CompanySearchSelect";
import { useQuoteStore } from "@/store/useQuoteStore";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import MemberSelect from "../general/MemberSelect";
import { useMemberStore } from "@/store/useMemberStore";
import dayjs from "dayjs";

export const AddHistoryModal = () => {
  // 处理提交历史报价单
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const { createQuote } = useQuoteStore();
  const members = useMemberStore((state) => state.members);
  const fetchMembers = useMemberStore((state) => state.fetchMembers);
  const [modalVisible, setModalVisible] = useState(false);
  const [items, setItems] = useState<{ productCode: string; name: string }[]>(
    []
  );
  const [loading, setLoading] = useState(false);

  const findMemberIdByName = (name: string) => {
    return members.find((m) => m.name === name)?.id;
  };

  const handleSearchOrder = async (value: string) => {
    if (!value) return;
    try {
      await fetchMembers();
      const data = await OrderService.getOrderInfo(value);
      setItems(data.items ?? []);
      form.setFieldsValue({
        orderId: data["订单号"],
        customer: { name: data["客户名称"], erpId: data["客户ID"] },
        quoteTime: data["订单日期"] ? dayjs(data["订单日期"]) : null,
        chargerId: findMemberIdByName(data["销售负责人"] ?? ""),
        projectManagerId: findMemberIdByName(data["项目负责人"] ?? ""),
        contactName: data["联系人"],
        contactPhone: data["电话"],
      });
    } catch (e: any) {
      if (e?.response?.data) {
        message.error("订单号已存在");
        return;
      }
      console.error(e);
      message.error("查询订单失败");
    }
  };
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      setModalVisible(false);
      const quote = await createQuote({
        ...values,
        orderId: values.orderId,
        quoteId: values.quoteId,
        customerId: values.customer.erpId,
        customerName: values.customer.name,
        date: new Date(values.quoteTime),
        chargerId: values.chargerId,
        projectManagerId: values.projectManagerId,
        quoteName: values.quoteName,
        contactName: values.contactName,
        contactPhone: values.contactPhone,
        isClosed: true,
        items: items.map((item) => ({
          productCode: item.productCode,
          productName: item.name,
          quantity: 1,
          brand: "精诚",
          discountRate: 100,
          config: {},
        })),
      });
      message.success("历史报价单添加成功");
      form.resetFields();
      if (quote?.id) {
        navigate(`/quote/${quote.id}`);
      }
      setLoading(false);
    } catch (error: any) {
      if (
        error?.response?.data?.message &&
        /订单.*重复/.test(error.response.data.message)
      ) {
        form.setFields([{ name: "orderId", errors: ["订单编号已存在"] }]);
      }
      console.error("添加历史报价单失败:", error);
      message.error("添加历史报价单失败");
      setLoading(false);
    }
  };
  return (
    <>
      {loading && (
        <div className="full-page-spin">
          <Spin tip="加载中..." size="large" />
        </div>
      )}
      <div style={{ marginBottom: 16 }}>
        <Button type="primary" onClick={() => setModalVisible(true)}>
          添加历史报价单
        </Button>
      </div>
      <Modal
        title="添加历史报价单"
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col xs={12} md={12}>
              <Form.Item
                name="quoteId"
                label="报价编号"
                rules={[{ required: true, message: "请输入报价编号" }]}
              >
                <Input placeholder="请输入报价编号" />
              </Form.Item>
            </Col>
            <Col xs={12} md={12}>
              <Form.Item
                name="orderId"
                label="订单编号"
                rules={[{ required: true, message: "请输入订单编号" }]}
              >
                <InputWithButton
                  placeholder="请输入订单编号"
                  buttonText="查询"
                  onButtonClick={() =>
                    handleSearchOrder(form.getFieldValue("orderId"))
                  }
                />
              </Form.Item>
            </Col>
            <Col xs={12} md={12}>
              <Form.Item
                name="quoteName"
                label="报价名称"
                rules={[{ required: true, message: "请输入报价名称" }]}
              >
                <Input placeholder="请输入报价名称" />
              </Form.Item>
            </Col>
            <Col xs={12} md={12}>
              <Form.Item
                name="customer"
                label="客户名称"
                rules={[{ required: true, message: "请选择客户" }]}
              >
                <CompanySearchSelect
                  fetchOptions={CustomerService.searchCompanies}
                />
              </Form.Item>
            </Col>
            <Col xs={12} md={12}>
              <Form.Item
                name="quoteTime"
                label="报价日期"
                rules={[{ required: true, message: "请选择报价日期" }]}
              >
                <DatePicker
                  style={{ width: "100%" }}
                  maxDate={dayjs("2025/5/1")}
                />
              </Form.Item>
            </Col>
            <Col xs={12} md={12}>
              <Form.Item
                name="chargerId"
                label="销售负责人"
                rules={[{ required: true, message: "请选择销售负责人" }]}
              >
                <MemberSelect />
              </Form.Item>
            </Col>
            <Col xs={12} md={12}>
              <Form.Item
                name="projectManagerId"
                label="项目负责人"
                rules={[{ required: true, message: "请选择项目负责人" }]}
              >
                <MemberSelect />
              </Form.Item>
            </Col>
            <Form.Item name="contactName" hidden>
              <Input />
            </Form.Item>
            <Form.Item name="contactPhone" hidden>
              <Input />
            </Form.Item>
          </Row>
        </Form>
      </Modal>
    </>
  );
};
