import {
  ClusterOutlined,
  DatabaseOutlined,
  FileSearchOutlined,
  FileTextOutlined,
} from "@/components/ui/icons";
import DesktopLayout, { type DesktopNavEntry } from "./DesktopLayout";

const navEntries: DesktopNavEntry[] = [
  { key: "/agent/chat", label: "Agent 对话", description: "后续承载 ERP 助手对话", icon: <FileTextOutlined /> },
  {
    key: "agent-archive",
    label: "合同归档",
    description: "归档与字典审核",
    icon: <FileSearchOutlined />,
    children: [
      { key: "/agent/archive", label: "合同归档", description: "查看合同归档与版本", icon: <FileSearchOutlined /> },
      { key: "/agent/archive/product-configs", label: "产品配置查询", description: "按产品编号检索归档配置", icon: <DatabaseOutlined /> },
      { key: "/agent/review", label: "文档审核", description: "按文档逐条审核字典候选", icon: <FileSearchOutlined /> },
      { key: "/agent/clusters", label: "候选簇审核", description: "按候选簇批量治理字典候选", icon: <ClusterOutlined /> },
      { key: "/agent/concept-resolver", label: "概念解析审核", description: "审核解析器历史结果", icon: <ClusterOutlined /> },
      { key: "/agent/dictionary", label: "字典管理", description: "维护 termType 与 alias 属性", icon: <DatabaseOutlined /> },
    ],
  },
];

export default function AgentLayout() {
  return (
    <DesktopLayout
      brand="AI"
      title="ERP Agent"
      subtitle="助手与归档治理"
      badge="Agent"
      navEntries={navEntries}
    />
  );
}
