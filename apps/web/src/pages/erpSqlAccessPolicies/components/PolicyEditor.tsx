import { Button, Checkbox, Input, Radio, Select, Switch, Tag } from "@/components/ui/core";
import { moduleOptions } from "../constants";
import type { ErpSqlAccessPolicy, PolicyFormState } from "../types";

type Props = {
  form: PolicyFormState;
  selectedPolicy: ErpSqlAccessPolicy | null;
  saving: boolean;
  canManage: boolean;
  onPatch: <K extends keyof PolicyFormState>(key: K, value: PolicyFormState[K]) => void;
  onNew: () => void;
  onSave: () => void;
  onPreview: () => void;
  onSetEnabled: (enabled: boolean) => void;
  onArchive: () => void;
};

export function PolicyEditor({
  form,
  selectedPolicy,
  saving,
  canManage,
  onPatch,
  onNew,
  onSave,
  onPreview,
  onSetEnabled,
  onArchive,
}: Props) {
  return (
    <section className="erp-policy-editor">
      <div className="erp-policy-editor__topbar">
        <div>
          <h2>{selectedPolicy ? "编辑数据范围策略" : "新增数据范围策略"}</h2>
          <p>Company 和具体行范围由服务端强制注入；敏感 full 还需要用户权限同时满足。</p>
        </div>
        <div className="erp-policy-editor__actions">
          {selectedPolicy && <Tag color={selectedPolicy.enabled ? "cyan" : "gold"}>{selectedPolicy.enabled ? "启用中" : "已禁用"}</Tag>}
          <Button onClick={onNew} disabled={!canManage}>新建</Button>
          <Button onClick={onPreview} loading={saving} disabled={!canManage}>预览</Button>
          <Button type="primary" onClick={onSave} loading={saving} disabled={!canManage}>保存</Button>
        </div>
      </div>

      <div className="erp-policy-form">
        <label className="erp-policy-form__wide">
          <span>主体类型</span>
          <Radio.Group
            value={form.subjectType}
            options={[
              { value: "user", label: "用户" },
              { value: "role", label: "角色" },
            ]}
            onChange={(event: any) => canManage && onPatch("subjectType", event.target.value)}
          />
        </label>
        <label>
          <span>{form.subjectType === "user" ? "userId" : "roleId"}</span>
          <Input disabled={!canManage} value={form.subjectId} placeholder="identity id" onChange={(event: any) => onPatch("subjectId", event.target.value)} />
        </label>
        <label>
          <span>环境</span>
          <Select
            value={form.environment}
            options={[
              { value: "production", label: "production" },
              { value: "development", label: "development" },
            ]}
            disabled={!canManage}
            onChange={(value: PolicyFormState["environment"]) => onPatch("environment", value)}
          />
        </label>
        <label>
          <span>rolloutMode</span>
          <Input disabled={!canManage} value={form.rolloutMode} onChange={(event: any) => onPatch("rolloutMode", event.target.value)} />
        </label>
        <label>
          <span>Company 列表</span>
          <Input disabled={!canManage} value={form.companiesText} placeholder="EPIC03, EPIC06" onChange={(event: any) => onPatch("companiesText", event.target.value)} />
        </label>
        <label className="erp-policy-form__wide">
          <span>允许模块</span>
          <Checkbox.Group value={form.modules} options={moduleOptions} onChange={(value: string[]) => canManage && onPatch("modules", value)} />
        </label>
        <label>
          <span>部门范围</span>
          <Input disabled={!canManage} value={form.departmentsText} placeholder="* 或 D01, D02" onChange={(event: any) => onPatch("departmentsText", event.target.value)} />
        </label>
        <label>
          <span>事业部范围</span>
          <Input disabled={!canManage} value={form.businessUnitsText} placeholder="* 或 BU01, BU02" onChange={(event: any) => onPatch("businessUnitsText", event.target.value)} />
        </label>
        <label>
          <span>客户范围</span>
          <Input disabled={!canManage} value={form.customerNumbersText} placeholder="* 或 1001, 1002" onChange={(event: any) => onPatch("customerNumbersText", event.target.value)} />
        </label>
        <label>
          <span>批准人</span>
          <Input disabled={!canManage} value={form.approvedBy} onChange={(event: any) => onPatch("approvedBy", event.target.value)} />
        </label>
        <label>
          <span>生效时间</span>
          <Input disabled={!canManage} type="datetime-local" value={form.effectiveFrom} onChange={(event: any) => onPatch("effectiveFrom", event.target.value)} />
        </label>
        <label>
          <span>过期时间</span>
          <Input disabled={!canManage} type="datetime-local" value={form.expiresAt} onChange={(event: any) => onPatch("expiresAt", event.target.value)} />
        </label>
        <label className="erp-policy-form__wide">
          <span>敏感字段上限</span>
          <div className="erp-policy-switches">
            <span><Switch disabled={!canManage} checked={form.sensitiveFinance} onChange={(value: boolean) => onPatch("sensitiveFinance", value)} /> 财务 full</span>
            <span><Switch disabled={!canManage} checked={form.sensitiveCustomer} onChange={(value: boolean) => onPatch("sensitiveCustomer", value)} /> 客户 full</span>
            <span><Switch disabled={!canManage} checked={form.sensitiveEmployee} onChange={(value: boolean) => onPatch("sensitiveEmployee", value)} /> 员工/报工 full</span>
            <span><Switch disabled={!canManage} checked={form.enabled} onChange={(value: boolean) => onPatch("enabled", value)} /> 保存为启用</span>
          </div>
        </label>
        <label className="erp-policy-form__wide">
          <span>变更原因</span>
          <Input.TextArea disabled={!canManage} value={form.reason} rows={3} onChange={(event: any) => onPatch("reason", event.target.value)} />
        </label>
      </div>

      {selectedPolicy && (
        <div className="erp-policy-editor__danger">
          <Button loading={saving} disabled={!canManage} onClick={() => onSetEnabled(!selectedPolicy.enabled)}>
            {selectedPolicy.enabled ? "禁用策略" : "启用策略"}
          </Button>
          <Button danger loading={saving} disabled={!canManage} onClick={onArchive}>归档</Button>
        </div>
      )}
    </section>
  );
}
