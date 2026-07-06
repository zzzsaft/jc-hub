import {
  applyAliasGapAliasProposals,
  auditArchiveSearchDiagnostics,
  buildAliasGapAliasApplyPlan,
  defaultArchiveSearchDiagnosticTerms,
} from "../archive/archiveSearchDiagnostics.js";

type Args = {
  queryText?: string;
  termType?: string;
  aliasTerms?: string[];
  defaultLimit?: number;
  expandedLimit?: number;
  productType?: string;
  materials?: string[];
  application?: string;
  widthMm?: number;
  minConfidence?: number;
  applyAliases?: boolean;
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const queryText = args.queryText ?? "1380mm PVC+UPVC 波浪板模头";
  const report = await auditArchiveSearchDiagnostics({
    queryText,
    termType: args.termType ?? "application",
    aliasTerms: args.aliasTerms?.length ? args.aliasTerms : defaultArchiveSearchDiagnosticTerms(queryText),
    defaultLimit: args.defaultLimit ?? 10,
    expandedLimit: args.expandedLimit ?? 50,
    productType: args.productType ?? "flat_die",
    materials: args.materials ?? ["PVC", "UPVC"],
    application: args.application ?? "波浪板",
    widthMm: args.widthMm ?? 1380,
  });
  const aliasApplyPlan = buildAliasGapAliasApplyPlan(report.aliasGapAudit, { minConfidence: args.minConfidence ?? 0.7 });
  const applyResult = args.applyAliases
    ? await applyAliasGapAliasProposals(aliasApplyPlan.proposals)
    : null;

  console.log(JSON.stringify({
    checkedAt: new Date().toISOString(),
    ...report,
    aliasApplyPlan,
    ...(applyResult ? { aliasApplyResult: applyResult } : {}),
  }, null, 2));
}

function parseArgs(args: string[]): Args {
  const parsed: Args = {};
  for (const arg of args) {
    const [key, ...valueParts] = arg.replace(/^--/, "").split("=");
    const value = valueParts.join("=");
    if (!key || !value) continue;
    if (key === "query") parsed.queryText = value;
    if (key === "term-type") parsed.termType = value;
    if (key === "terms") parsed.aliasTerms = value.split(",").map((item) => item.trim()).filter(Boolean);
    if (key === "default-limit") parsed.defaultLimit = Number(value);
    if (key === "expanded-limit") parsed.expandedLimit = Number(value);
    if (key === "product-type") parsed.productType = value;
    if (key === "materials") parsed.materials = value.split(",").map((item) => item.trim()).filter(Boolean);
    if (key === "application") parsed.application = value;
    if (key === "width-mm") parsed.widthMm = Number(value);
    if (key === "min-confidence") parsed.minConfidence = Number(value);
  }
  parsed.applyAliases = args.includes("--apply-aliases");
  return parsed;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
