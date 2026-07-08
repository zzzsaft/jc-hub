import { Link } from "react-router-dom";
import {
  CheckSquareOutlined,
  ClusterOutlined,
  DatabaseOutlined,
  FileSearchOutlined,
  FileTextOutlined,
  HistoryOutlined,
  InboxOutlined,
  LayoutOutlined,
  UserOutlined,
} from "@/components/ui/icons";
import "./styles.less";

const appGroups = [
  {
    title: "智能辅助",
    apps: [
      { title: "Agent 对话", description: "智能问答与业务辅助", path: "/agent/chat", icon: <FileTextOutlined />, tone: "blue" },
      { title: "合同归档", description: "合同配置归档与检索", path: "/agent/archive", icon: <DatabaseOutlined />, tone: "green" },
      { title: "候选审核", description: "抽取字段与候选项审核", path: "/agent/review", icon: <FileSearchOutlined />, tone: "violet" },
      { title: "候选簇", description: "归并候选项和治理建议", path: "/agent/clusters", icon: <ClusterOutlined />, tone: "cyan" },
      { title: "概念解析", description: "术语概念治理和样本核对", path: "/agent/concept-resolver", icon: <CheckSquareOutlined />, tone: "amber" },
      { title: "字典治理", description: "产品字段、别名和标准值", path: "/agent/dictionary", icon: <LayoutOutlined />, tone: "indigo" },
    ],
  },
  {
    title: "业务管理",
    apps: [
      { title: "历史报价单", description: "查看和检索报价记录", path: "/admin/quote/history", icon: <HistoryOutlined />, tone: "slate" },
      { title: "OA 报价单", description: "同步 OA 流程单据", path: "/admin/quote/oa", icon: <InboxOutlined />, tone: "orange" },
      { title: "待办任务", description: "处理待提交与待审批", path: "/admin/quote/todo", icon: <CheckSquareOutlined />, tone: "rose" },
      { title: "模板管理", description: "维护报价模板配置", path: "/admin/template", icon: <LayoutOutlined />, tone: "teal" },
      { title: "采购申请", description: "物料需求申请", path: "/admin/purchase/apply", icon: <DatabaseOutlined />, tone: "yellow" },
      { title: "外部联系人", description: "绑定企微外部联系人", path: "/admin/external-contact", icon: <UserOutlined />, tone: "lime" },
    ],
  },
  {
    title: "移动工作台",
    apps: [
      { title: "工单领取", description: "生产任务领取", path: "/work/claim", icon: <CheckSquareOutlined />, tone: "blue" },
      { title: "现场操作", description: "移动端作业记录", path: "/work/operations", icon: <LayoutOutlined />, tone: "green" },
      { title: "生产统计", description: "查看移动端统计", path: "/work/stats", icon: <HistoryOutlined />, tone: "cyan" },
      { title: "我的", description: "个人工作台", path: "/work/me", icon: <UserOutlined />, tone: "slate" },
    ],
  },
];

const appCount = appGroups.reduce((total, group) => total + group.apps.length, 0);

export default function HomePage() {
  return (
    <main className="home-page">
      <div className="home-shell">
        <section className="home-hero" aria-labelledby="home-title">
          <div>
            <p className="home-eyebrow">JC Hub</p>
            <h1 id="home-title">工作台</h1>
            <p className="home-subtitle">Agent、报价、采购、客户入口统一工作台</p>
          </div>
          <div className="home-summary" aria-label="入口统计">
            <strong>{appCount}</strong>
            <span>应用入口</span>
          </div>
        </section>

        {appGroups.map((group) => (
          <section key={group.title} className="home-app-section">
            <h2>{group.title}</h2>
            <div className="home-app-grid" aria-label={group.title}>
              {group.apps.map((app) => (
                <Link key={app.path} to={app.path} className="home-app-card">
                  <span className={`home-app-icon home-app-icon-${app.tone}`}>{app.icon}</span>
                  <span className="home-app-copy">
                    <strong>{app.title}</strong>
                    <span>{app.description}</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
