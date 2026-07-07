export interface Customer {
  id: string;
  name: string;
  charger?: string;
  contact?: string;
  phone?: string;
}

export interface Opportunity {
  id: string;
  name: string;
  customerId: string;
  companyName: string;
  quoteCount: number;
  status: "none" | "quoting" | "reviewing" | "completed";
  creator: string;
  lastQuoteDate?: string;
}

export const statusTagColor = {
  none: "gray",
  quoting: "blue",
  reviewing: "orange",
  completed: "green",
};

export const statusText = {
  none: "未报价",
  quoting: "报价中",
  reviewing: "审核中",
  completed: "报价完成",
};

export type Position = {
  latitude: number;
  longitude: number;
};

export interface Clause {
  id: number;
  index: number;
  title: string;
  content: string;
}

export interface Quote {
  id: number;
  quoteId?: string;
  orderId?: string;
  quoteNumber: number;
  quoteName: string;
  type: string;
  opportunityId?: string;
  opportunityName?: string; // opportunityName
  material: string[]; // 适用原料
  finalProduct: string; // 最终产品
  applicationField: string; // 应用领域
  currencyType: string; // 货币类型
  customerName: string; // 客户名称
  customerId: string; // 客户id
  creatorId: string; // 创建人id
  chargerId: string; // 负责人id
  salesSupportId: string; // 销售支持id
  projectManagerId: string; // 项目管理id
  totalProductPrice: number; // 产品价格合计
  discountAmount: number; // 优惠金额
  hideItemPrice?: boolean; // 是否隐藏分项价格
  quoteAmount: number; // 报价单金额
  deliveryDays: number; // 交期天数
  address: any; // 地址
  contactName: string; // 联系人姓名
  contactPhone: string; // 联系人手机号
  senderId?: string; // 发送人id
  senderPhone?: string; // 发送人电话
  telephone?: string; // 电话
  faxNumber?: string; // 传真号
  remark?: string; // 备注
  companyInfo?: {
    companyAddress?: string; // 单位地址
    legalPersonName?: string; // 法定代表人
    authorizedPerson?: string; // 委托代表人
    bankName?: string; // 开户银行
    bankAccount?: string; // 账号
    postalCode?: string; // 邮政编码
  };
  technicalLevel: string; // 技术等级
  projectLevel: string; // 项目等级
  flowState: string; // 报价状态
  currentApprovalNode: string; // 当前审批节点
  currentApprover: string; // 当前审批人
  quoteTime: Date | null; // 报价时间
  quoteValidDays?: number; // 报价有效期天数
  quoteDeadline?: Date | null; // 报价截止日期
  createdAt?: string; // 创建日期
  quoteTerms: Clause[];
  contractTerms: Clause[];
  quotationPdf?: string; // 报价单打印链接
  contractPdf?: string; // 合同打印链接
  configPdf?: string; // 配置表打印链接
  isClosed?: boolean; // 是否已成交
  items: QuoteItem[];
  status: "draft" | "checking" | "completed" | "locked";
}

export interface QuoteItem {
  id: number;
  productCategory: string[] | null;
  index: number;
  productName?: string;
  productCode?: string;
  config?: ProductConfig;
  formType?: string; // 记录使用的表单类型
  quantity: number;
  unitPrice: number | null;
  discountRate: number | null;
  unit: string;
  brand: string;
  subtotal: number | null;
  isCompleted: boolean;
  children?: QuoteItem[];
  parentId: number;
  linkId?: number;
  source?: {
    name: string;
    value: any;
    key: string;
  };
  importInfo?: {
    type: "template" | "order";
    name: string;
    id: string;
  };
  isCategoryLocked: boolean;
}

export interface ProductSearchResult {
  item: QuoteItem;
  material: string[];
  industry: string;
  customer: string;
  finalProduct: string;
  orderDate: string;
}

export interface PartSearchResult {
  id: string;
  name: string;
  category: string;
  price: number;
  unit: string;
  type: "P" | "M";
}

interface ProductConfig {
  [key: string]: any;
}

export interface ProductCategory {
  level1Category: string;
  level2Category: string;
  level3Category: string;
}

export interface CompanyOption {
  jdyid?: string;
  name: string;
  erpid: string;
  label?: string;
}

export interface FilterProduct {
  id: number;
  name: string;
  model: string;
  filterBoard: string | null;
  production: string | null;
  dimension: string | null;
  weight: string | null;
  filterDiameter: string | null;
  effectiveFilterArea: string | null;
  power: string | null;
  pressure: string | null;
  remark: string | null;
}

export interface IntervalValue {
  front: number;
  rear: number;
  value: string;
  unit: string;
}

export interface QuoteTemplate {
  id: string;
  name: string;
  description: string;
  materials: string[]; // 适用材料
  industries: string[]; // 适用行业
  templateType: string; // 模版类型：平模/计量泵/换网器...
  creatorId: string;
  createdAt: string;
  config?: ProductConfig;
}
