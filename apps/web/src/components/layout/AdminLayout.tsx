import {
  CheckSquareOutlined,
  DatabaseOutlined,
  HistoryOutlined,
  InboxOutlined,
  LayoutOutlined,
  SettingOutlined,
  UserOutlined,
} from "@/components/ui/icons";
import DesktopLayout, { type DesktopNavEntry } from "./DesktopLayout";

const navEntries: DesktopNavEntry[] = [
  {
    key: "quote",
    label: "报价业务",
    description: "报价单与模板",
    icon: <HistoryOutlined />,
    children: [
      { key: "/admin/quote/history", label: "历史报价单", description: "查看与检索报价记录", icon: <HistoryOutlined />, permission: "admin.quote:view" },
      { key: "/admin/quote/oa", label: "OA 报价单", description: "同步 OA 流程单据", icon: <InboxOutlined />, permission: "admin.quote:view" },
      { key: "/admin/quote/todo", label: "待办任务", description: "处理待提交与待审批", icon: <CheckSquareOutlined />, permission: "admin.quote:view" },
      { key: "/admin/template", label: "模板管理", description: "维护报价模板配置", icon: <LayoutOutlined />, permission: "admin.template:view" },
    ],
  },
  {
    key: "purchase",
    label: "采购业务",
    description: "采购申请与跟踪",
    icon: <DatabaseOutlined />,
    children: [
      { key: "/admin/purchase/apply", label: "采购申请", description: "物料需求申请", icon: <DatabaseOutlined />, permission: "admin.purchase.apply:view" },
    ],
  },
  { key: "/admin/employees", label: "员工资料", description: "资料、账号、角色与权限", icon: <SettingOutlined />, permission: "admin.employees:view" },
  { key: "/admin/external-contact", label: "外部联系人", description: "绑定企微外部联系人", icon: <UserOutlined />, permission: "admin.external-contact:view" },
];

export default function AdminLayout() {
  return (
    <DesktopLayout
      brand="ERP"
      title="ERP 管理后台"
      subtitle="后台业务菜单"
      badge="Admin"
      navEntries={navEntries}
    />
  );
}
