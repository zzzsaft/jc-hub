import React from "react";
import {
  Row,
  Col,
  Form,
  Input,
  InputNumber,
  AutoComplete,
  DatePicker,
  Switch,
} from "@/components/ui/core";
import { TailCard } from "@/components/ui/proComponents";
import dayjs from "dayjs";
import MaterialSelect from "../general/MaterialSelect";
import CompanySearchSelect from "../general/CompanySearchSelect";
import MemberSelect from "../general/MemberSelect";
import AddressInput from "../general/AddressInput";
import { CustomSelect } from "../general/CustomSelect";
import { MoneyInput } from "../general/MoneyInput";
import QuoteItemsTable from "./QuoteItemsTable";
import { Quote } from "@/types/types";
import { selectOptions } from "@/utils/value";

const SENDER_PHONE_OPTIONS = [
  { value: "0576-84610021", label: "蔡:0576-84610021" },
  { value: "0576-84610010", label: "阮:0576-84610010" },
  { value: "0576-84610019", label: "辛:0576-84610019" },
  { value: "0576-84610007", label: "张1:0576-84610007" },
  { value: "0576-84025778", label: "张2:0576-84025778" },
  { value: "0576-84610008", label: "杨:0576-84610008" },
  { value: "0576-84610003", label: "闫:0576-84610003" },
  { value: "0576-84025988", label: "卞:0576-84025988" },
  { value: "0576-84610002", label: "卓:0576-84610002" },
];

const INDUSTRY = {
  新能源及储能: ["动力电池（锂电、氢燃料、钠电）", "光伏新能源"],
  半导体及电子元器件: ["半导体（泛半导体）", "先进封装", "高端显示"],
  消费电子: ["消费电子"],
  医疗及环保: ["医疗卫生", "环保行业"],
  工业制造及材料: ["新型建材", "包装行业"],
};

const FINALPRODUCT = {
  未知: ["未知"],
  功能片材: [
    "高阻隔片材",
    "高阻隔包边片材",
    "阻燃片材",
    "降解片材",
    "微发泡片材",
    "交联发泡片材",
    "弹性体片材",
    "橡胶片材",
  ],
  结构片材: ["载带片材", "钢管包覆片材", "魔术贴片材", "彩条片材"],
  工艺片材: ["浸纤片材", "浸润片材"],
  其他片材: ["片材"],
  功能薄膜: [
    "太阳能膜",
    "电池隔离膜",
    "车衣膜",
    "卫材底膜",
    "护卡膜",
    "保鲜膜",
    "牧草膜",
    "土工膜",
  ],
  工艺薄膜: [
    "流延膜",
    "拉丝膜",
    "缠绕膜",
    "淋膜",
    "复合淋膜",
    "压纹膜",
    "压纹膜、磨砂膜",
    "气泡垫延膜",
  ],
  材质薄膜: ["铝箔膜", "铝塑膜", "玻璃夹胶膜", "透气膜"],
  其他薄膜: ["薄膜"],
};

const FINALPRODUCT_OPTIONS = selectOptions(FINALPRODUCT);

interface QuoteConfigTabProps {
  form: any;
  quote?: Quote;
  nameOptions: { value: string; label: string }[];
  phoneOptions: { value: string; label: string }[];
  faxOptions: { value: string; label: string }[];
  addressOptions: { value: string; label: string }[];
  handleNameSelect: (value: string) => void;
}

const QuoteConfigTab: React.FC<QuoteConfigTabProps> = ({
  form,
  quote,
  nameOptions,
  phoneOptions,
  faxOptions,
  addressOptions,
  handleNameSelect,
}) => {
  const onDateChange = (date: any) => {
    form.setFieldsValue({ quoteTime: date?.toDate() });
  };
  return (
    <>
      <Row gutter={16}></Row>
      <TailCard
        title="基础信息"
        collapsible
        defaultCollapsed={false}
        style={{ marginBottom: 16 }}
        headerBordered
      >
        <Row gutter={16}>
          {quote?.type != "history" && (
            <Col xs={8} md={4}>
              <Form.Item
                name="quoteId"
                label="报价单编号"
                rules={[{ required: true, message: "请输入报价单编号" }]}
              >
                <Input
                  style={{ width: "100%" }}
                  readOnly={quote?.type != "history"}
                />
              </Form.Item>
            </Col>
          )}
          <Form.Item noStyle dependencies={["isClosed"]}>
            {({ getFieldValue }) =>
              getFieldValue("isClosed") ? (
                <Col xs={8} md={4}>
                  <Form.Item
                    name="orderId"
                    label="订单编号"
                    rules={[{ required: true, message: "请输入订单编号" }]}
                  >
                    <Input
                      style={{ width: "100%" }}
                      readOnly={quote?.type != "history"}
                    />
                  </Form.Item>
                </Col>
              ) : null
            }
          </Form.Item>
          <Col xs={12} md={8}>
            <Form.Item
              name="quoteName"
              label="报价单名称"
              rules={[{ required: true, message: "请输入报价单名称" }]}
            >
              <Input />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item
              name="isClosed"
              label="是否已成交"
              valuePropName="checked"
              initialValue={true}
            >
              <Switch />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="customerProductionId" label="需方生产线指令号">
              <Input />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col xs={12} md={8}>
            <Form.Item
              name="material"
              label="适用原料"
              rules={[{ required: true, message: "请填写适用原料" }]}
            >
              <MaterialSelect />
            </Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item
              name="finalProduct"
              label="最终产品"
              rules={[{ required: true, message: "请填写最终产品" }]}
            >
              <AutoComplete options={FINALPRODUCT_OPTIONS} />
            </Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item name="applicationField" label="应用领域">
              <CustomSelect initialGroups={INDUSTRY} dropdown={false} />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item
              name="产品明细"
              rules={[
                {
                  required: true,
                  validator: () => {
                    if (!quote?.items) {
                      return Promise.reject("请输入至少一条产品");
                    }
                    if (quote?.items.length == 0) {
                      return Promise.reject("请输入至少一条产品");
                    }
                    return Promise.resolve();
                  },
                },
                {
                  required: true,
                  validator: () => {
                    const index = quote?.items.findIndex(
                      (item) => !item.isCompleted
                    );
                    if (index != -1) {
                      return Promise.reject(
                        `第${(index ?? 0) + 1}个产品产品配置未完成`
                      );
                    }
                    return Promise.resolve();
                  },
                },
              ]}
            >
              <QuoteItemsTable quoteId={quote?.id ?? 0} />
            </Form.Item>
          </Col>
        </Row>
      </TailCard>
      <TailCard
        title="报价单价格"
        collapsible
        defaultCollapsed={false}
        style={{ marginBottom: 16 }}
        headerBordered
      >
        <Row gutter={16}>
          <Col xs={12} md={6}>
            <Form.Item label="产品价格合计">
              <MoneyInput
                quoteId={quote?.id ?? 0}
                value={quote?.totalProductPrice ?? 0}
                readOnly
              />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item
              name="discountAmount"
              label="优惠金额"
              normalize={(value) => parseFloat(value)}
            >
              <MoneyInput quoteId={quote?.id ?? 0} />
            </Form.Item>
          </Col>

          <Col xs={12} md={6}>
            <Form.Item label="报价单金额">
              <MoneyInput
                quoteId={quote?.id ?? 0}
                value={quote?.quoteAmount ?? 0}
                readOnly
              />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item
              name="deliveryDays"
              label="交期天数"
              rules={[{ required: true, message: "请输入交期天数" }]}
            >
              <InputNumber
                style={{ width: "100%" }}
                min={0}
                max={365}
                formatter={(value) => `${value}天`}
                controls={false}
                parser={(value) => {
                  const num = Number(value?.replace("天", "") || 0);
                  return Math.min(Math.max(num, 0), 365) as any;
                }}
              />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item
              name="hideItemPrice"
              label="隐藏分项价格"
              valuePropName="checked"
              initialValue={false}
            >
              <Switch />
            </Form.Item>
          </Col>
        </Row>
      </TailCard>
      <TailCard
        title="联系信息"
        collapsible
        defaultCollapsed={false}
        style={{ marginBottom: 16 }}
        headerBordered
      >
        <Row gutter={16}>
          <Col xs={16} md={12}>
            <Form.Item
              name="customerName"
              label="客户选择"
              rules={[{ required: true, message: "请选择客户" }]}
            >
              <CompanySearchSelect placeholder="请选择客户" />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item
              name="contactName"
              label="联系人姓名"
              rules={[{ required: true, message: "请输入联系人姓名" }]}
            >
              <AutoComplete options={nameOptions} onSelect={handleNameSelect} />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item
              name="contactPhone"
              label="联系人手机号"
              rules={[{ required: true, message: "请输入联系人手机号" }]}
            >
              <AutoComplete options={phoneOptions} />
            </Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item name="telephone" label="电话">
              <Input />
            </Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item name="faxNumber" label="传真号">
              <AutoComplete options={faxOptions} />
            </Form.Item>
          </Col>
          <Col xs={24} md={24}>
            <Form.Item
              name="address"
              label="收货地址"
              rules={[{ required: true, message: "请输入收货地址" }]}
            >
              <AddressInput addressOptions={addressOptions} />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item
              name="senderId"
              label="发送人"
              initialValue={quote?.salesSupportId}
            >
              <MemberSelect
                placeholder="选择发送人"
                departmentKeywords={["项目", "销售"]}
              />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="senderPhone" label="发送人电话">
              <AutoComplete options={SENDER_PHONE_OPTIONS} />
            </Form.Item>
          </Col>
        </Row>
      </TailCard>
      <TailCard
        title="负责人信息"
        collapsible
        defaultCollapsed={false}
        style={{ marginBottom: 16 }}
        headerBordered
      >
        <Row gutter={16}>
          <Col xs={12} md={6}>
            <Form.Item
              name="creatorId"
              label="创建人"
              rules={[{ required: true, message: "请选择创建人" }]}
            >
              <MemberSelect placeholder="选择创建人" disabled />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item
              name="chargerId"
              label="负责人"
              rules={[{ required: true, message: "请选择负责人" }]}
            >
              <MemberSelect placeholder="选择负责人" />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="projectManagerId" label="项目管理">
              <MemberSelect placeholder="选择项目管理" />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item name="salesSupportId" label="销售支持">
              <MemberSelect placeholder="选择销售支持" />
            </Form.Item>
          </Col>
          {/* <Col xs={12} md={6}>
            <Form.Item
              name="quoteTime"
              label="报价时间"
              rules={[{ required: true, message: "请选择报价时间" }]}
            >
              <DatePicker
                style={{ width: "100%" }}
                onChange={onDateChange}
                maxDate={dayjs("2025/5/1")}
              />
            </Form.Item>
          </Col> */}
        </Row>
      </TailCard>
      <TailCard
        title="备注"
        collapsible
        defaultCollapsed={false}
        style={{ marginBottom: 16 }}
        headerBordered
      >
        <Row gutter={16}>
          <Col span={24}>
            <Form.Item name="remark" label="备注">
              <Input.TextArea rows={3} placeholder="请输入备注信息" />
            </Form.Item>
          </Col>
        </Row>
      </TailCard>
    </>
  );
};

export default QuoteConfigTab;
