import { Button, Empty, Input, Pagination, Select, Tag } from "@/components/ui/core";
import type { ErpSqlAccessPolicy } from "../types";
import { dateText, rangeText } from "../utils";

type Props = {
  items: ErpSqlAccessPolicy[];
  total: number;
  page: number;
  pageSize: number;
  selectedId: string;
  keyword: string;
  enabledFilter: string;
  loading: boolean;
  onKeywordChange: (value: string) => void;
  onEnabledFilterChange: (value: string) => void;
  onSearch: () => void;
  onPageChange: (page: number) => void;
  onSelect: (policy: ErpSqlAccessPolicy) => void;
};

export function PolicyList({
  items,
  total,
  page,
  pageSize,
  selectedId,
  keyword,
  enabledFilter,
  loading,
  onKeywordChange,
  onEnabledFilterChange,
  onSearch,
  onPageChange,
  onSelect,
}: Props) {
  return (
    <aside className="erp-policy-list">
      <div className="erp-policy-list__filters">
        <Input value={keyword} placeholder="userId / roleId / 原因" onChange={(event: any) => onKeywordChange(event.target.value)} />
        <Select
          value={enabledFilter}
          options={[
            { value: "", label: "全部状态" },
            { value: "true", label: "启用" },
            { value: "false", label: "禁用" },
          ]}
          onChange={onEnabledFilterChange}
        />
        <Button loading={loading} onClick={onSearch}>搜索</Button>
      </div>

      <div className="erp-policy-list__items">
        {items.map((policy) => (
          <button
            key={policy.id}
            type="button"
            className={["erp-policy-list__item", selectedId === policy.id ? "erp-policy-list__item--active" : ""].join(" ")}
            onClick={() => onSelect(policy)}
          >
            <div className="erp-policy-list__row">
              <span className="erp-policy-list__subject">{policy.userId || policy.roleId}</span>
              <Tag color={policy.enabled ? "cyan" : "gold"}>{policy.enabled ? "启用" : "禁用"}</Tag>
            </div>
            <div className="erp-policy-list__meta">{policy.environment} / {policy.modules.join(", ")}</div>
            <div className="erp-policy-list__meta">Company: {rangeText(policy.companies)}</div>
            <div className="erp-policy-list__meta">更新：{dateText(policy.updatedAt)}</div>
          </button>
        ))}
        {!items.length && <Empty description="暂无策略" />}
      </div>

      {total > pageSize && (
        <Pagination current={page} pageSize={pageSize} total={total} onChange={onPageChange} className="erp-policy-list__pagination" />
      )}
    </aside>
  );
}
