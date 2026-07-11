import { Empty } from "@/components/ui/core";
import type { AccessPolicyAuditLog } from "../types";
import { dateText } from "../utils";

type Props = {
  preview: unknown;
  auditLogs: AccessPolicyAuditLog[];
};

export function PolicySidePanel({ preview, auditLogs }: Props) {
  return (
    <aside className="erp-policy-side">
      <section>
        <h3>Scope 预览</h3>
        {preview ? (
          <pre className="erp-policy-json">{JSON.stringify(preview, null, 2)}</pre>
        ) : (
          <Empty description="保存前可先预览服务端归一化 scope" />
        )}
      </section>

      <section>
        <h3>最近审计</h3>
        <div className="erp-policy-audit">
          {auditLogs.map((log) => (
            <div key={log.id} className="erp-policy-audit__item">
              <div className="erp-policy-audit__row">
                <strong>{log.action}</strong>
                <span>{dateText(log.createdAt)}</span>
              </div>
              <div>操作人：{log.actorUserId || "-"}</div>
              <div>原因：{log.reason || "-"}</div>
            </div>
          ))}
          {!auditLogs.length && <Empty description="暂无审计日志" />}
        </div>
      </section>
    </aside>
  );
}
