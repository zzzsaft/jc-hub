import React, { useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Avatar, Dropdown } from "@/components/ui/core";
import {
  DownOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SettingOutlined,
  UserOutlined,
} from "@/components/ui/icons";
import type { MenuProps } from "@/components/ui/core";
import { useAuthStore } from "@/store/useAuthStore";

export type DesktopNavItem = {
  key: string;
  label: string;
  description: string;
  icon?: React.ReactNode;
  permission?: string;
};

export type DesktopNavGroup = DesktopNavItem & {
  children: DesktopNavItem[];
};

export type DesktopNavEntry = DesktopNavItem | DesktopNavGroup;

const isNavGroup = (item: DesktopNavEntry): item is DesktopNavGroup => "children" in item;

type DesktopLayoutProps = {
  brand: string;
  title: string;
  subtitle: string;
  badge: string;
  navEntries: DesktopNavEntry[];
  hideMobileHeader?: boolean;
  hideDesktopSidebar?: boolean;
  hideDesktopHeader?: boolean;
};

export default function DesktopLayout({ brand, title, subtitle, badge, navEntries, hideMobileHeader, hideDesktopSidebar, hideDesktopHeader }: DesktopLayoutProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [openGroupKeys, setOpenGroupKeys] = useState<string[]>([]);
  const navigate = useNavigate();
  const location = useLocation();
  const { name: storeName, avatar, canAny } = useAuthStore();
  const name = storeName || "用户";
  const visibleNavEntries = useMemo(() => {
    return navEntries
      .map((item) => {
        if (!isNavGroup(item)) return !item.permission || canAny([item.permission]) ? item : null;
        const children = item.children.filter((child) => !child.permission || canAny([child.permission]));
        return children.length ? { ...item, children } : null;
      })
      .filter(Boolean) as DesktopNavEntry[];
  }, [canAny, navEntries]);

  const navItems = useMemo(
    () => visibleNavEntries.flatMap((item) => (isNavGroup(item) ? item.children : item)),
    [visibleNavEntries],
  );

  const activeKey = useMemo(() => {
    return (
      navItems
        .filter((item) => item.key === "/" ? location.pathname === "/" : location.pathname.startsWith(item.key))
        .sort((a, b) => b.key.length - a.key.length)[0]?.key || navItems[0]?.key || "/"
    );
  }, [location.pathname, navItems]);

  useEffect(() => {
    const activeGroup = visibleNavEntries.find((item) => isNavGroup(item) && item.children.some((child) => child.key === activeKey));
    if (!activeGroup) return;
    setOpenGroupKeys((keys) => keys.includes(activeGroup.key) ? keys : [...keys, activeGroup.key]);
  }, [activeKey, visibleNavEntries]);

  const userDropdownItems: MenuProps["items"] = [
    {
      key: "settings",
      label: "系统设置",
      icon: <SettingOutlined />,
    },
  ];

  const handleNavigate = (key: string) => {
    navigate(key);
    setMenuOpen(false);
  };

  const toggleGroup = (key: string) => {
    setOpenGroupKeys((keys) => keys.includes(key) ? keys.filter((item) => item !== key) : [...keys, key]);
  };

  const renderNavItem = (item: DesktopNavItem, nested = false, collapsed = sidebarCollapsed) => {
    const active = item.key === activeKey;

    return (
      <button
        key={item.key}
        type="button"
        aria-label={collapsed && !nested ? item.label : undefined}
        onClick={() => handleNavigate(item.key)}
        className={[
          "group relative flex w-full appearance-none items-center gap-3 rounded-md border border-transparent text-left shadow-none transition",
          "focus:outline-none focus:ring-2 focus:ring-brand-200",
          collapsed && !nested ? "min-h-[48px] justify-center px-2 py-2" : nested ? "min-h-[42px] px-3 py-2 pl-11" : "min-h-[52px] px-3 py-2",
          active
            ? "bg-brand-50 text-brand-700"
            : "bg-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900",
        ].join(" ")}
      >
        <span className={["absolute inset-y-2 left-0 w-0.5 rounded-r-full transition", active ? "bg-brand-600 opacity-100" : "bg-transparent opacity-0"].join(" ")} />
        {!nested && (
          <span className={["flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-base transition", active ? "bg-brand-600 text-white shadow-sm" : "bg-slate-100/80 text-slate-500 group-hover:bg-white group-hover:text-slate-700"].join(" ")}>
            {item.icon}
          </span>
        )}
        {(!collapsed || nested) && (
          <span className="min-w-0 flex-1">
            <span className={["block truncate font-medium leading-5", nested ? "text-[13px]" : "text-sm", active ? "text-brand-700" : "text-slate-700 group-hover:text-slate-950"].join(" ")}>
              {item.label}
            </span>
            {!nested && (
              <span className={["mt-0.5 block truncate text-xs leading-4", active ? "text-brand-700/70" : "text-slate-400 group-hover:text-slate-500"].join(" ")}>
                {item.description}
              </span>
            )}
          </span>
        )}
      </button>
    );
  };

  const renderSidebar = (collapsed = sidebarCollapsed) => (
    <aside className={["flex h-full flex-col border-r border-line bg-white transition-all duration-200", collapsed ? "w-16" : "w-60"].join(" ")}>
      <div className={["flex h-16 items-center gap-3 border-b border-line-subtle", collapsed ? "justify-center px-2" : "px-4"].join(" ")}>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-sm font-semibold text-white shadow-sm shadow-brand-600/25">
          {brand}
        </div>
        {!collapsed && <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="truncate text-sm font-semibold leading-5 text-slate-950">{title}</div>
            <span className="rounded border border-brand-100 bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none text-brand-700">
              {badge}
            </span>
          </div>
          <div className="truncate text-xs leading-4 text-slate-500">{subtitle}</div>
        </div>}
      </div>

      <nav className={["flex-1 space-y-0.5 overflow-y-auto py-3", collapsed ? "px-2" : "px-2.5"].join(" ")}>
        {visibleNavEntries.map((item) => {
          if (!isNavGroup(item)) return renderNavItem(item, false, collapsed);

          const open = openGroupKeys.includes(item.key);
          const active = item.children.some((child) => child.key === activeKey);

          return (
            <div key={item.key} className="space-y-0.5">
              <button
                type="button"
                aria-label={collapsed ? item.label : undefined}
                aria-expanded={open}
                onClick={() => collapsed ? handleNavigate(item.children[0].key) : toggleGroup(item.key)}
                className={[
                  "group relative flex min-h-[52px] w-full appearance-none items-center gap-3 rounded-md border border-transparent px-3 py-2 text-left shadow-none transition",
                  "focus:outline-none focus:ring-2 focus:ring-brand-200",
                  collapsed ? "justify-center px-2" : "",
                  active
                    ? "bg-slate-50 text-slate-950"
                    : "bg-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                ].join(" ")}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100/80 text-base text-slate-500 transition group-hover:bg-white group-hover:text-slate-700">
                  {item.icon}
                </span>
                {!collapsed && <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold leading-5 text-slate-700 group-hover:text-slate-950">
                    {item.label}
                  </span>
                  <span className="mt-0.5 block truncate text-xs leading-4 text-slate-400 group-hover:text-slate-500">
                    {item.description}
                  </span>
                </span>}
                {!collapsed && <DownOutlined className={["shrink-0 text-xs text-slate-400 transition-transform group-hover:text-slate-600", open ? "rotate-180" : "rotate-0"].join(" ")} />}
              </button>
              {!collapsed && open && <div className="space-y-0.5 border-l border-slate-100 pl-2">{item.children.map((child) => renderNavItem(child, true, collapsed))}</div>}
            </div>
          );
        })}
      </nav>
    </aside>
  );

  const activeItem = navItems.find((item) => item.key === activeKey);

  return (
    <div className="min-h-screen bg-app-bg text-text-primary">
      {!hideDesktopSidebar && <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:block">{renderSidebar(sidebarCollapsed)}</div>}

      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="关闭菜单" className="absolute inset-0 z-0 h-full w-full bg-slate-950/35" onClick={() => setMenuOpen(false)} />
          <div className="relative z-10 h-full w-60 shadow-xl">{renderSidebar(false)}</div>
        </div>
      )}

      <div className={["transition-all duration-200", hideDesktopSidebar ? "lg:pl-0" : sidebarCollapsed ? "lg:pl-16" : "lg:pl-60"].join(" ")}>
        <header className={[
          "sticky top-0 z-30 h-14 items-center justify-between border-b border-line bg-app-panel/95 px-4 shadow-sm backdrop-blur",
          hideDesktopHeader ? "hidden" : hideMobileHeader ? "hidden lg:flex" : "flex",
        ].join(" ")}>
          <div className="flex min-w-0 items-center gap-3">
            {!hideDesktopSidebar && <button
              type="button"
              aria-label={menuOpen ? "收起菜单" : "展开菜单"}
              onClick={() => setMenuOpen((open) => !open)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-200 lg:hidden"
            >
              {menuOpen ? <MenuFoldOutlined /> : <MenuUnfoldOutlined />}
            </button>}
            {!hideDesktopSidebar && <button
              type="button"
              aria-label={sidebarCollapsed ? "展开侧栏" : "收起侧栏"}
              onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
              className="hidden h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-200 lg:inline-flex"
            >
              {sidebarCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            </button>}

            <div className="hidden min-w-0 lg:block">
              <div className="text-sm font-semibold text-slate-900">{activeItem?.label || title}</div>
              <div className="text-xs text-slate-500">{activeItem?.description || subtitle}</div>
            </div>
          </div>

          <Dropdown menu={{ items: userDropdownItems }} trigger={["click"]}>
            <button type="button" className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 shadow-sm transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-200">
              <Avatar size="small" icon={<UserOutlined />} src={avatar} />
              <span className="hidden max-w-32 truncate sm:inline">{name}</span>
            </button>
          </Dropdown>
        </header>

        <main className={hideDesktopHeader ? "min-h-screen p-0" : hideMobileHeader ? "min-h-screen p-0 lg:min-h-[calc(100vh-56px)] lg:p-4" : "min-h-[calc(100vh-56px)] p-3 sm:p-4"}>
          <div className={hideDesktopHeader
            ? "min-h-screen bg-white p-0"
            : hideMobileHeader
            ? "min-h-screen bg-white p-0 lg:min-h-[calc(100vh-88px)] lg:rounded-md lg:border lg:border-line lg:bg-app-panel lg:p-4 lg:shadow-sm"
            : "min-h-[calc(100vh-88px)] rounded-md border border-line bg-app-panel p-4 shadow-sm"}
          >
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
