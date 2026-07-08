import { NavLink, Outlet } from "react-router-dom";
import {
  CheckSquareOutlined,
  DatabaseOutlined,
  HistoryOutlined,
  UserOutlined,
} from "@/components/ui/icons";
import { useAuthStore } from "@/store/useAuthStore";
import styles from "./MobileLayout.module.less";

const navItems = [
  { to: "/work/claim", label: "领取工序", icon: <CheckSquareOutlined />, permission: "work.claim:view" },
  { to: "/work/operations", label: "工序清单", icon: <HistoryOutlined />, permission: "work.operations:view" },
  { to: "/work/stats", label: "我的统计", icon: <DatabaseOutlined />, permission: "work.stats:view" },
  { to: "/work/me", label: "我的", icon: <UserOutlined />, permission: "work.me:view" },
];

export default function MobileLayout() {
  const canAny = useAuthStore((state) => state.canAny);
  const visibleNavItems = navItems.filter((item) => canAny([item.permission]));
  return (
    <div className={styles.shell}>
      <main className={styles.main}>
        <Outlet />
      </main>
      <nav className={styles.nav} aria-label="生产移动端导航">
        {visibleNavItems.map((item) => (
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
