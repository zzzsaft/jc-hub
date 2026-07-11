import { Typography } from "@/components/ui/core";
import { useAuthStore } from "@/store/useAuthStore";
import { PolicyEditor } from "./components/PolicyEditor";
import { PolicyList } from "./components/PolicyList";
import { PolicySidePanel } from "./components/PolicySidePanel";
import { useErpSqlAccessPolicyPageState } from "./hooks/useErpSqlAccessPolicyPageState";
import "./styles.less";

export default function ErpSqlAccessPoliciesPage() {
  const state = useErpSqlAccessPolicyPageState();
  const canManage = useAuthStore((store) => store.canAny(["agent.erp-sql.access-policy:manage"]));

  return (
    <div className="erp-policy-page">
      <header className="erp-policy-page__header">
        <div>
          <Typography.Title level={3}>ERP SQL 数据范围策略</Typography.Title>
          <Typography.Text type="secondary">维护用户或角色的 Company、模块、行级范围和敏感字段上限。</Typography.Text>
        </div>
      </header>

      <div className="erp-policy-page__body">
        <PolicyList
          items={state.items}
          total={state.total}
          page={state.page}
          pageSize={state.pageSize}
          selectedId={state.selectedId}
          keyword={state.keyword}
          enabledFilter={state.enabledFilter}
          loading={state.loading}
          onKeywordChange={state.setKeyword}
          onEnabledFilterChange={state.setEnabledFilter}
          onSearch={() => state.load(1)}
          onPageChange={state.load}
          onSelect={state.selectPolicy}
        />
        <PolicyEditor
          form={state.form}
          selectedPolicy={state.selectedPolicy}
          saving={state.saving}
          canManage={canManage}
          onPatch={state.patchForm}
          onNew={state.newPolicy}
          onSave={state.save}
          onPreview={state.previewScope}
          onSetEnabled={state.setEnabled}
          onArchive={state.archive}
        />
        <PolicySidePanel preview={state.preview} auditLogs={state.auditLogs} />
      </div>
    </div>
  );
}
