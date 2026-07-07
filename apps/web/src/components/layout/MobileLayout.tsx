import { NavLink, Outlet } from "react-router-dom";
import {
  CheckSquareOutlined,
  DatabaseOutlined,
  HistoryOutlined,
  UserOutlined,
} from "@/components/ui/icons";
import styles from "./MobileLayout.module.less";

const navItems = [
  { to: "/work/claim", label: "领取工序", icon: <CheckSquareOutlined /> },
  { to: "/work/operations", label: "工序清单", icon: <HistoryOutlined /> },
  { to: "/work/stats", label: "我的统计", icon: <DatabaseOutlined /> },
  { to: "/work/me", label: "我的", icon: <UserOutlined /> },
];

export default function MobileLayout() {
  return (
    <div className={styles.shell}>
      <main className={styles.main}>
        <Outlet />
      </main>
      <nav className={styles.nav} aria-label="生产移动端导航">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => (isActive ? styles.active : "")}
          >
            {item.icon}
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
