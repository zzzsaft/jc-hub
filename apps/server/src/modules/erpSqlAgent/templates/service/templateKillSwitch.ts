export function approvedTemplateKillSwitchReason(template: {
  id: bigint | string;
  sourceFamilyId?: string | null;
}): string | undefined {
  if (process.env.ERP_SQL_AGENT_EXECUTE_APPROVED_TEMPLATES === "false") {
    return "approved_template_execution_disabled";
  }
  if (csvSet(process.env.ERP_SQL_DISABLED_TEMPLATE_IDS).has(String(template.id))) {
    return `template_disabled:${String(template.id)}`;
  }
  if (template.sourceFamilyId && csvSet(process.env.ERP_SQL_DISABLED_FAMILIES).has(template.sourceFamilyId)) {
    return `template_family_disabled:${template.sourceFamilyId}`;
  }
  return undefined;
}

function csvSet(value: string | undefined): Set<string> {
  return new Set((value ?? "").split(",").map((item) => item.trim()).filter(Boolean));
}
