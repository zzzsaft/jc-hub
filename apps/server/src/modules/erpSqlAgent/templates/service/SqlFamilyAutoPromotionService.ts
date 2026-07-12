import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { prisma } from "../../../../lib/prisma.js";
import { requireTemplateModuleAccessMapping } from "../../access/index.js";
import {
  SqlTemplateDraftValidationService,
  type SqlTemplateDraftValidationReport,
} from "./SqlTemplateDraftValidationService.js";
import type { ErpSqlQueryResult } from "../../query/index.js";

type BusinessFamily = {
  familyId: string;
  reportNames: string[];
  datasetNames: string[];
  moduleGuess: string;
  coreTables: string[];
  coreJoins: string[];
  params: string[];
  representativeDatasetId: number;
  representativeSql: string;
  sampleDatasetIds: number[];
  hasFanruanMacroCount?: number;
  hasNonSelectRiskCount?: number;
  hasHardcodedCompanyCount?: number;
};

type ClassificationFile = { families?: Array<{ familyId?: string; bucket?: string; reason?: string }> };
type BusinessSamplesFile = { businessFamilies?: BusinessFamily[] };

type QueryClient = {
  query(options: { sql: string; maxRows?: number }): Promise<ErpSqlQueryResult>;
};

type TemplateAsset = {
  familyId: string;
  name: string;
  intent: string;
  module: string;
  questionPattern: string;
  normalizedQuestion: string;
  queryPlanJson: Record<string, unknown>;
  sqlTemplate: string;
  requiredParams: string[];
  optionalParams: string[];
  tables: string[];
  fields: string[];
  joins: string[];
  sourceDatasetIds: number[];
  sourceReportNames: string[];
  sourceSqlHashes: string[];
  notes: string;
};

type ReferenceAsset = {
  familyId: string;
  familyName: string;
  module: string;
  intent: string;
  businessDescription: string;
  coreTables: string[];
  coreJoins: string[];
  commonParams: string[];
  representativeDatasetId: number;
  representativeSql: string;
  sampleDatasetIds: number[];
  reportNames: string[];
  datasetNames: string[];
  riskFlags: string[];
};

type MetricAsset = {
  familyId: string;
  metricCode: string;
  metricName: string;
  module: string;
  businessDescription: string;
  calculationSummary: string;
  coreTables: string[];
  coreJoins: string[];
  params: string[];
  representativeSql: string;
  sourceReportNames: string[];
  sourceDatasetIds: number[];
  notes: string;
};

export type SqlFamilyAutoPromotionRepository = {
  upsertTemplateDraft(input: TemplateAsset): Promise<void>;
  upsertReferenceFamily(input: ReferenceAsset): Promise<void>;
  upsertMetricDraft(input: MetricAsset): Promise<void>;
  verifyFamilies?(families: string[]): Promise<SqlFamilyAutoPromotionReport["verification"]>;
};

export type SqlFamilyAutoPromotionOptions = {
  classificationPath: string;
  businessSamplesPath: string;
  families: string[];
  company: string;
  apply?: boolean;
  batchId?: string;
};

type FamilyValidationSummary = {
  schemaStatus: "pass" | "fail" | "warning" | "skipped";
  compileStatus: "pass" | "fail" | "skipped";
  missingTables: string[];
  missingColumns: string[];
  errorSummary?: string;
};

export type SqlFamilyAutoPromotionCompactReport = {
  kind: "auto_promote_compact_report";
  batchId: string;
  summary: {
    inputFamilies: number;
    appliedTemplateDrafts: number;
    downgradedReferences: number;
    registeredMetricDrafts: number;
    skipped: number;
    failed: number;
  };
  appliedTemplates: Array<{
    familyId: string;
    name: string;
    schemaStatus: "pass";
    compileStatus: "pass";
    autoFixes: string[];
    approvalStatus: "draft";
    approved: false;
    guardPassed: false;
  }>;
  downgradedReferences: Array<{
    familyId: string;
    name: string;
    reason: string;
    schemaStatus: FamilyValidationSummary["schemaStatus"];
    compileStatus: FamilyValidationSummary["compileStatus"];
    missingTables: string[];
    missingColumns: string[];
    errorSummary?: string;
  }>;
  registeredMetricDrafts: Array<{ familyId: string; metricCode: string; metricName: string; status: "draft" }>;
  skippedFamilies: Array<{ familyId: string; reason: string }>;
  failures: Array<{ familyId: string; errorSummary: string }>;
};

export type SqlFamilyAutoPromotionReport = SqlFamilyAutoPromotionCompactReport & {
  mode: "apply" | "dry_run";
  candidates: Array<{
    familyId: string;
    target: "template" | "reference" | "metric" | "skipped";
    template?: TemplateAsset;
    reference?: ReferenceAsset;
    metric?: MetricAsset;
    validation?: SqlTemplateDraftValidationReport["templates"][number];
    initialValidation?: SqlTemplateDraftValidationReport["templates"][number];
  }>;
  validationReports: SqlTemplateDraftValidationReport[];
  verification?: {
    summary: {
      templateDraftFound: number;
      referenceFamilyFound: number;
      metricDraftFound: number;
      failedCount: number;
    };
    failures: string[];
  };
};

const TEMPLATE_DEFS: Record<string, Omit<TemplateAsset, "tables" | "joins" | "sourceDatasetIds" | "sourceReportNames" | "sourceSqlHashes">> = {
  family_027: {
    familyId: "family_027",
    name: "库存查询",
    intent: "inventory_stock_lookup",
    module: "inventory",
    questionPattern: "按物料、仓库、库位、产品群组查询库存",
    normalizedQuestion: "库存查询",
    queryPlanJson: {},
    sqlTemplate: `SELECT TOP 100
  p.Company AS [公司],
  p.PartNum AS [物料编号],
  p.PartDescription AS [物料描述],
  p.ProdCode AS [产品群组],
  pw.WarehouseCode AS [仓库],
  wh.Description AS [仓库名称],
  pb.BinNum AS [库位],
  wb.Description AS [库位描述],
  pw.OnHandQty AS [仓库库存],
  pb.OnhandQty AS [库位库存]
FROM Erp.Part p
LEFT JOIN Erp.PartWhse pw ON pw.Company = p.Company AND pw.PartNum = p.PartNum
LEFT JOIN Erp.PartBin pb ON pb.Company = pw.Company AND pb.PartNum = pw.PartNum AND pb.WarehouseCode = pw.WarehouseCode
LEFT JOIN Erp.Warehse wh ON wh.Company = pw.Company AND wh.WarehouseCode = pw.WarehouseCode
LEFT JOIN Erp.WhseBin wb ON wb.Company = pb.Company AND wb.WarehouseCode = pb.WarehouseCode AND wb.BinNum = pb.BinNum
WHERE (@companyScope IS NULL OR p.Company = @companyScope)
  AND (@partNum IS NULL OR p.PartNum = @partNum)
  AND (@partDescription IS NULL OR p.PartDescription LIKE CONCAT('%', @partDescription, '%'))
  AND (@warehouseCode IS NULL OR pw.WarehouseCode = @warehouseCode)
  AND (@binNum IS NULL OR pb.BinNum = @binNum)
  AND (@prodCode IS NULL OR p.ProdCode = @prodCode)
  AND (@onlyNonZeroStock = 0 OR COALESCE(pb.OnhandQty, pw.OnHandQty, 0) <> 0)`,
    requiredParams: [],
    optionalParams: ["companyScope", "partNum", "partDescription", "warehouseCode", "binNum", "prodCode", "onlyNonZeroStock"],
    fields: ["Company", "PartNum", "PartDescription", "ProdCode", "WarehouseCode", "Description", "BinNum", "OnHandQty", "OnhandQty"],
    notes: "草稿来自 family_027；去除硬编码公司、仓库和产品群组，使用可选参数过滤。",
  },
  family_014: {
    familyId: "family_014",
    name: "部门班组资源群组查询",
    intent: "department_resource_group_lookup",
    module: "production_master_data",
    questionPattern: "查询部门、班组、资源群组辅助字典",
    normalizedQuestion: "部门 / 班组 / 资源群组查询",
    queryPlanJson: {},
    sqlTemplate: `SELECT TOP 100
  d.Company AS [公司],
  d.JCDept AS [部门编号],
  d.Description AS [部门名称],
  rg.ResourceGrpID AS [资源群组],
  rg.Description AS [资源群组名称]
FROM Erp.JCDept d
LEFT JOIN Erp.ResourceGroup rg ON rg.Company = d.Company AND rg.JCDept = d.JCDept
WHERE (@companyScope IS NULL OR d.Company = @companyScope)
  AND (@departmentName IS NULL OR d.Description = @departmentName)
  AND (@resourceGroupId IS NULL OR rg.ResourceGrpID = @resourceGroupId)`,
    requiredParams: [],
    optionalParams: ["companyScope", "departmentName", "resourceGroupId"],
    fields: ["Company", "JCDept", "Description", "ResourceGrpID"],
    notes: "草稿来自 family_014；作为报工和设备分析的部门/资源群组参数辅助查询。",
  },
  family_038: {
    familyId: "family_038",
    name: "工序字典查询",
    intent: "operation_master_lookup",
    module: "production_master_data",
    questionPattern: "查询 OpMaster 工序字典",
    normalizedQuestion: "工序字典 / OpMaster 查询",
    queryPlanJson: {},
    sqlTemplate: `SELECT TOP 100
  om.Company AS [公司],
  om.OpCode AS [工序编码],
  om.OpDesc AS [工序名称]
FROM Erp.OpMaster om
WHERE (@companyScope IS NULL OR om.Company = @companyScope)
  AND (@opCode IS NULL OR om.OpCode = @opCode)
  AND (@opDescription IS NULL OR om.OpDesc LIKE CONCAT('%', @opDescription, '%'))`,
    requiredParams: [],
    optionalParams: ["companyScope", "opCode", "opDescription"],
    fields: ["Company", "OpCode", "OpDesc"],
    notes: "草稿来自 family_038；只抽取 OpMaster 工序字典，不绑定原报表宏。",
  },
  family_086: {
    familyId: "family_086",
    name: "研发工单物料需求查询",
    intent: "rd_job_material_requirement_lookup",
    module: "production_rnd",
    questionPattern: "查询研发工单、装配和物料需求",
    normalizedQuestion: "研发工单 BOM / 研发物料发料",
    queryPlanJson: {},
    sqlTemplate: `SELECT TOP 100
  jh.Company AS [公司],
  jh.JobNum AS [工单号],
  jh.PartNum AS [产品编号],
  jh.PartDescription AS [产品描述],
  jh.ProjectID AS [项目编号],
  ja.AssemblySeq AS [装配序号],
  ja.PartNum AS [装配物料],
  jm.MtlSeq AS [物料序号],
  jm.PartNum AS [需求物料],
  jm.Description AS [物料描述],
  jm.RequiredQty AS [需求数量],
  jm.IssuedQty AS [已发数量],
  jm.RequiredQty - jm.IssuedQty AS [未发数量]
FROM Erp.JobHead jh
LEFT JOIN Erp.JobAsmbl ja ON ja.Company = jh.Company AND ja.JobNum = jh.JobNum
LEFT JOIN Erp.JobMtl jm ON jm.Company = ja.Company AND jm.JobNum = ja.JobNum AND jm.AssemblySeq = ja.AssemblySeq
WHERE (@companyScope IS NULL OR jh.Company = @companyScope)
  AND (@jobNum IS NULL OR jh.JobNum = @jobNum)
  AND (@parentPartNum IS NULL OR jh.PartNum = @parentPartNum)
  AND (@materialPartNum IS NULL OR jm.PartNum = @materialPartNum)
  AND (@onlyUnissued = 0 OR jm.RequiredQty > jm.IssuedQty)`,
    requiredParams: [],
    optionalParams: ["companyScope", "jobNum", "parentPartNum", "materialPartNum", "onlyUnissued"],
    fields: ["Company", "JobNum", "PartNum", "PartDescription", "ProjectID", "AssemblySeq", "MtlSeq", "Description", "RequiredQty", "IssuedQty"],
    notes: "草稿来自 family_086；只保留研发工单物料需求明细，不抽取成本、料费或加工费指标。",
  },
  family_089: {
    familyId: "family_089",
    name: "库存安全库存查询",
    intent: "inventory_safety_stock_lookup",
    module: "inventory",
    questionPattern: "查询库存、库位库存和低于安全库存的物料",
    normalizedQuestion: "库存 / 库龄 / 呆滞库存",
    queryPlanJson: {},
    sqlTemplate: `SELECT TOP 100
  pb.Company AS [公司],
  pb.PartNum AS [物料编号],
  p.PartDescription AS [物料描述],
  pb.WarehouseCode AS [仓库],
  pb.BinNum AS [库位],
  pb.LotNum AS [批次],
  pb.OnhandQty AS [库位库存],
  pw.SafetyQty AS [安全库存],
  CASE WHEN pw.SafetyQty > 0 AND pb.OnhandQty <= pw.SafetyQty * 0.9 THEN 1 ELSE 0 END AS [是否低于安全库存]
FROM Erp.PartBin pb
LEFT JOIN Erp.Part p ON p.Company = pb.Company AND p.PartNum = pb.PartNum
LEFT JOIN Erp.PartWhse pw ON pw.Company = pb.Company AND pw.PartNum = pb.PartNum AND pw.WarehouseCode = pb.WarehouseCode
WHERE (@companyScope IS NULL OR pb.Company = @companyScope)
  AND (@partNum IS NULL OR pb.PartNum = @partNum)
  AND (@warehouseCode IS NULL OR pb.WarehouseCode = @warehouseCode)
  AND (@binNum IS NULL OR pb.BinNum = @binNum)
  AND (@onlyBelowSafety = 0 OR (pw.SafetyQty > 0 AND pb.OnhandQty <= pw.SafetyQty * 0.9))`,
    requiredParams: [],
    optionalParams: ["companyScope", "partNum", "warehouseCode", "binNum", "onlyBelowSafety"],
    fields: ["Company", "PartNum", "PartDescription", "WarehouseCode", "BinNum", "LotNum", "OnhandQty", "SafetyQty"],
    notes: "草稿来自 family_089；保留库存和安全库存判断，库龄/呆滞口径后续人工确认。",
  },
  family_092: {
    familyId: "family_092",
    name: "报工资源群组查询",
    intent: "labor_resource_group_lookup",
    module: "production_master_data",
    questionPattern: "查询报工明细使用的资源群组辅助字典",
    normalizedQuestion: "报工明细 / 资源群组辅助",
    queryPlanJson: {},
    sqlTemplate: `SELECT TOP 100
  rg.Company AS [公司],
  rg.ResourceGrpID AS [资源群组],
  rg.Description AS [资源群组名称],
  rg.JCDept AS [部门编号]
FROM Erp.ResourceGroup rg
WHERE (@companyScope IS NULL OR rg.Company = @companyScope)
  AND (@resourceGroupId IS NULL OR rg.ResourceGrpID = @resourceGroupId)
  AND (@descriptionLike IS NULL OR rg.Description LIKE CONCAT('%', @descriptionLike, '%'))
  AND rg.Description NOT LIKE N'%删除%'`,
    requiredParams: [],
    optionalParams: ["companyScope", "resourceGroupId", "descriptionLike"],
    fields: ["Company", "ResourceGrpID", "Description", "JCDept"],
    notes: "草稿来自 family_092；作为报工明细的资源群组参数辅助查询。",
  },
  family_006: {
    familyId: "family_006",
    name: "BOM / ECO 物料明细查询",
    intent: "bom_eco_material_detail_lookup",
    module: "engineering",
    questionPattern: "按产品、版本和物料查询 BOM / ECO 物料明细",
    normalizedQuestion: "BOM / ECO 物料明细查询",
    queryPlanJson: {},
    sqlTemplate: `SELECT TOP 100
  er.Company AS [公司],
  er.PartNum AS [产品编号],
  er.PartDescription AS [产品描述],
  er.RevisionNum AS [版本],
  er.RevDescription AS [版本描述],
  er.Approved AS [是否批准],
  er.ApprovedDate AS [批准日期],
  em.MtlSeq AS [物料序号],
  em.MtlPartNum AS [物料编号],
  p.PartDescription AS [物料描述],
  em.QtyPer AS [单位用量],
  em.FixedQty AS [固定数量],
  em.RelatedOperation AS [关联工序]
FROM Erp.ECORev er
LEFT JOIN Erp.ECOMtl em ON em.Company = er.Company AND em.PartNum = er.PartNum AND em.RevisionNum = er.RevisionNum
LEFT JOIN Erp.Part p ON p.Company = em.Company AND p.PartNum = em.MtlPartNum
WHERE (@companyScope IS NULL OR er.Company = @companyScope)
  AND (@partNum IS NULL OR er.PartNum = @partNum)
  AND (@revisionNum IS NULL OR er.RevisionNum = @revisionNum)
  AND (@materialPartNum IS NULL OR em.MtlPartNum = @materialPartNum)
  AND (@onlyApproved = 0 OR er.Approved = 1)`,
    requiredParams: [],
    optionalParams: ["companyScope", "partNum", "revisionNum", "materialPartNum", "onlyApproved"],
    fields: ["Company", "PartNum", "PartDescription", "RevisionNum", "RevDescription", "Approved", "ApprovedDate", "MtlSeq", "MtlPartNum", "QtyPer", "FixedQty", "RelatedOperation"],
    notes: "草稿来自 family_006；将 PUB.* 映射到可编译的 Erp.ECORev/Erp.ECOMtl/Erp.Part。",
  },
  family_031: {
    familyId: "family_031",
    name: "工单工序进度查询",
    intent: "job_operation_progress_lookup",
    module: "production",
    questionPattern: "按工单、工序和日期查询 JobOper 工序进度",
    normalizedQuestion: "工单工序进度查询",
    queryPlanJson: {},
    sqlTemplate: `SELECT TOP 100
  jo.Company AS [公司],
  jo.JobNum AS [工单号],
  jo.AssemblySeq AS [装配序号],
  jo.OprSeq AS [工序序号],
  jo.OpCode AS [工序编码],
  jo.OpDesc AS [工序描述],
  jo.PartNum AS [物料编号],
  jo.JobComplete AS [工单完成],
  jo.OpComplete AS [工序完成],
  jo.ProdComplete AS [生产完成],
  jo.QtyCompleted AS [完成数量],
  jo.StartDate AS [开始日期],
  jo.DueDate AS [要求日期],
  jo.ActProdHours AS [实际生产工时],
  jo.ActSetupHours AS [实际准备工时]
FROM Erp.JobOper jo
WHERE (@companyScope IS NULL OR jo.Company = @companyScope)
  AND (@jobNum IS NULL OR jo.JobNum = @jobNum)
  AND (@opCode IS NULL OR jo.OpCode = @opCode)
  AND (@partNum IS NULL OR jo.PartNum = @partNum)
  AND (@dueDateFrom IS NULL OR jo.DueDate >= @dueDateFrom)
  AND (@dueDateTo IS NULL OR jo.DueDate <= @dueDateTo)
  AND (@onlyOpen = 0 OR jo.OpComplete = 0)`,
    requiredParams: [],
    optionalParams: ["companyScope", "jobNum", "opCode", "partNum", "dueDateFrom", "dueDateTo", "onlyOpen"],
    fields: ["Company", "JobNum", "AssemblySeq", "OprSeq", "OpCode", "OpDesc", "PartNum", "JobComplete", "OpComplete", "ProdComplete", "QtyCompleted", "StartDate", "DueDate", "ActProdHours", "ActSetupHours"],
    notes: "草稿来自 family_031；将 PUB.JobOper 映射到可编译的 Erp.JobOper。",
  },
};

const DIRECT_REFERENCE_FAMILY_IDS = new Set(["family_008", "family_080"]);
const METRIC_PATTERNS = /成本|毛利|提成|及时率/u;

const REFERENCE_META: Record<string, { familyName: string; module: string; intent: string; businessDescription: string; reason: string }> = {
  family_006: {
    familyName: "BOM / ECO",
    module: "engineering",
    intent: "bom_eco_reference",
    businessDescription: "BOM、ECO、工单物料需求和技术发货查询参考 SQL family。",
    reason: "schema_mapping_required",
  },
  family_008: {
    familyName: "产品报价明细 / 产品配置",
    module: "quotation",
    intent: "product_quotation_detail_reference",
    businessDescription: "产品报价、产品配置和合同配置外部库参考 SQL family。",
    reason: "external_schema_unverified",
  },
  family_031: {
    familyName: "PUB.JobOper 工序进度",
    module: "production",
    intent: "pub_joboper_progress_reference",
    businessDescription: "PUB.JobOper 工序进度和打光全局数据表参考 SQL family。",
    reason: "pub_schema_mapping_required",
  },
  family_080: {
    familyName: "产品报价合同号 / 产品配置",
    module: "quotation",
    intent: "product_quotation_contract_reference",
    businessDescription: "产品报价和产品配置合同号外部库参考 SQL family。",
    reason: "external_schema_unverified",
  },
  family_086: {
    familyName: "研发工单 BOM / 研发物料发料",
    module: "production_rnd",
    intent: "rd_job_bom_material_reference",
    businessDescription: "研发工单 BOM、研发物料发料和研发工单加工费分析参考 SQL family。",
    reason: "schema_or_compile_failed",
  },
  family_089: {
    familyName: "库存 / 库龄 / 呆滞库存",
    module: "inventory",
    intent: "inventory_aging_slow_moving_reference",
    businessDescription: "库存、库龄、呆滞库存和安全库存参考 SQL family。",
    reason: "schema_or_compile_failed",
  },
};

export class SqlFamilyAutoPromotionService {
  constructor(
    private readonly repository: SqlFamilyAutoPromotionRepository = new PrismaSqlFamilyAutoPromotionRepository(),
    private readonly validationService = new SqlTemplateDraftValidationService(),
  ) {}

  async promote(options: SqlFamilyAutoPromotionOptions): Promise<SqlFamilyAutoPromotionReport> {
    const classification = await readJson<ClassificationFile>(options.classificationPath, "classification");
    const samples = await readJson<BusinessSamplesFile>(options.businessSamplesPath, "business samples");
    if (!Array.isArray(classification.families)) throw new Error("classification file must contain a families array");
    if (!Array.isArray(samples.businessFamilies)) throw new Error("business samples file must contain a businessFamilies array");

    const batchId = options.batchId ?? "batch2";
    const sampleByFamily = new Map(samples.businessFamilies.map((family) => [family.familyId, family]));
    const report = emptyReport(batchId, options);
    const templateCandidates: TemplateAsset[] = [];
    const templateAutoFixes = new Map<string, string[]>();

    for (const familyId of options.families) {
      const family = sampleByFamily.get(familyId);
      if (!family) {
        report.skippedFamilies.push({ familyId, reason: "missing_business_sample" });
        continue;
      }
      if (isMetricFamily(family)) {
        const metric = buildMetricAsset(family);
        if (options.apply) await this.repository.upsertMetricDraft(metric);
        report.registeredMetricDrafts.push({ familyId, metricCode: metric.metricCode, metricName: metric.metricName, status: "draft" });
        report.candidates.push({ familyId, target: "metric", metric });
        continue;
      }
      if (DIRECT_REFERENCE_FAMILY_IDS.has(familyId)) {
        await this.downgradeReference(report, family, directReferenceReason(familyId), { schemaStatus: "skipped", compileStatus: "skipped", missingTables: [], missingColumns: [] }, options.apply);
        continue;
      }
      const template = buildTemplateAsset(family);
      if (!template) {
        await this.downgradeReference(report, family, "unsupported_template_family", { schemaStatus: "skipped", compileStatus: "skipped", missingTables: [], missingColumns: [] }, options.apply);
        continue;
      }
      templateCandidates.push(template);
      templateAutoFixes.set(familyId, []);
    }

    const initialValidation = await this.validateTemplates(templateCandidates, options.company);
    if (initialValidation) report.validationReports.push(initialValidation);

    const finalTemplates: Array<{ template: TemplateAsset; validation: SqlTemplateDraftValidationReport["templates"][number]; initialValidation?: SqlTemplateDraftValidationReport["templates"][number] }> = [];
    for (const template of templateCandidates) {
      const validation = findValidation(initialValidation, template.familyId);
      if (!validation) {
        report.failures.push({ familyId: template.familyId, errorSummary: "validation_missing" });
        continue;
      }
      if (isTemplatePass(validation)) {
        finalTemplates.push({ template, validation });
        continue;
      }
      if (isValidationInfrastructureFailure(validation)) {
        report.failures.push({ familyId: template.familyId, errorSummary: truncate(`validation_unavailable: ${summarizeValidation(validation).errorSummary ?? "schema/compile validation unavailable"}`, 1000) });
        report.candidates.push({ familyId: template.familyId, target: "template", template, validation });
        continue;
      }
      const fixed = applyLowRiskAutoFixes(template);
      if (!fixed.autoFixes.length) {
        await this.downgradeReference(report, sampleByFamily.get(template.familyId)!, "schema_or_compile_failed", summarizeValidation(validation), options.apply, validation);
        continue;
      }
      templateAutoFixes.set(template.familyId, fixed.autoFixes);
      const fixValidationReport = await this.validateTemplates([fixed.template], options.company);
      if (fixValidationReport) report.validationReports.push(fixValidationReport);
      const fixValidation = findValidation(fixValidationReport, template.familyId);
      if (fixValidation && isTemplatePass(fixValidation)) {
        finalTemplates.push({ template: fixed.template, validation: fixValidation, initialValidation: validation });
      } else if (fixValidation && isValidationInfrastructureFailure(fixValidation)) {
        report.failures.push({ familyId: template.familyId, errorSummary: truncate(`validation_unavailable: ${summarizeValidation(fixValidation).errorSummary ?? "schema/compile validation unavailable"}`, 1000) });
        report.candidates.push({ familyId: template.familyId, target: "template", template: fixed.template, validation: fixValidation, initialValidation: validation });
      } else {
        await this.downgradeReference(report, sampleByFamily.get(template.familyId)!, "schema_or_compile_failed_after_autofix", summarizeValidation(fixValidation ?? validation), options.apply, fixValidation ?? validation);
      }
    }

    for (const item of finalTemplates) {
      if (options.apply) await this.repository.upsertTemplateDraft(item.template);
      report.appliedTemplates.push({
        familyId: item.template.familyId,
        name: item.template.name,
        schemaStatus: "pass",
        compileStatus: "pass",
        autoFixes: templateAutoFixes.get(item.template.familyId) ?? [],
        approvalStatus: "draft",
        approved: false,
        guardPassed: false,
      });
      report.candidates.push({ familyId: item.template.familyId, target: "template", template: item.template, validation: item.validation, initialValidation: item.initialValidation });
    }

    if (options.apply && this.repository.verifyFamilies) report.verification = await this.repository.verifyFamilies(options.families);
    refreshSummary(report, options.families.length);
    return report;
  }

  private async downgradeReference(
    report: SqlFamilyAutoPromotionReport,
    family: BusinessFamily,
    reason: string,
    validationSummary: FamilyValidationSummary,
    apply: boolean | undefined,
    validation?: SqlTemplateDraftValidationReport["templates"][number],
  ): Promise<void> {
    const reference = buildReferenceAsset(family, reason);
    if (apply) await this.repository.upsertReferenceFamily(reference);
    report.downgradedReferences.push({
      familyId: family.familyId,
      name: reference.familyName,
      reason,
      schemaStatus: validationSummary.schemaStatus,
      compileStatus: validationSummary.compileStatus,
      missingTables: validationSummary.missingTables.slice(0, 20),
      missingColumns: validationSummary.missingColumns.slice(0, 20),
      ...(validationSummary.errorSummary ? { errorSummary: truncate(validationSummary.errorSummary, 1000) } : {}),
    });
    report.candidates.push({ familyId: family.familyId, target: "reference", reference, validation });
  }

  private async validateTemplates(templates: TemplateAsset[], company: string): Promise<SqlTemplateDraftValidationReport | undefined> {
    if (!templates.length) return undefined;
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sql-family-auto-promote-"));
    const reviewJsonPath = path.join(dir, "candidates.json");
    await fs.writeFile(reviewJsonPath, `${JSON.stringify({ templateDrafts: templates }, null, 2)}\n`, "utf8");
    return this.validationService.validate({ reviewJsonPath, company });
  }
}

class PrismaSqlFamilyAutoPromotionRepository implements SqlFamilyAutoPromotionRepository {
  async upsertTemplateDraft(input: TemplateAsset): Promise<void> {
    requireTemplateModuleAccessMapping(input.module);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "erp_agent"."erp_query_templates" (
        "name", "intent", "module", "question_pattern", "normalized_question", "query_plan_json",
        "sql_template", "required_params", "optional_params", "tables", "fields", "joins",
        "source_type", "source_family_id", "source_dataset_ids", "source_report_names", "source_sql_hashes",
        "guard_passed", "approved", "approval_status", "notes", "usage_count", "success_count"
      )
      VALUES (
        ${input.name}, ${input.intent}, ${input.module}, ${input.questionPattern}, ${input.normalizedQuestion},
        ${JSON.stringify(input.queryPlanJson)}::jsonb, ${input.sqlTemplate}, ${JSON.stringify(paramMap(input.requiredParams, true))}::jsonb,
        ${JSON.stringify(paramMap(input.optionalParams, false))}::jsonb, ${JSON.stringify(input.tables)}::jsonb,
        ${JSON.stringify(input.fields)}::jsonb, ${JSON.stringify(input.joins)}::jsonb, 'finereport_family',
        ${input.familyId}, ${JSON.stringify(input.sourceDatasetIds)}::jsonb,
        ${JSON.stringify(input.sourceReportNames)}::jsonb, ${JSON.stringify(input.sourceSqlHashes)}::jsonb,
        FALSE, FALSE, 'draft', ${input.notes}, 0, 0
      )
      ON CONFLICT ("source_family_id", "intent") WHERE "source_family_id" IS NOT NULL DO UPDATE SET
        "name" = excluded."name",
        "module" = excluded."module",
        "question_pattern" = excluded."question_pattern",
        "normalized_question" = excluded."normalized_question",
        "query_plan_json" = excluded."query_plan_json",
        "sql_template" = excluded."sql_template",
        "required_params" = excluded."required_params",
        "optional_params" = excluded."optional_params",
        "tables" = excluded."tables",
        "fields" = excluded."fields",
        "joins" = excluded."joins",
        "source_dataset_ids" = excluded."source_dataset_ids",
        "source_report_names" = excluded."source_report_names",
        "source_sql_hashes" = excluded."source_sql_hashes",
        "guard_passed" = FALSE,
        "approved" = FALSE,
        "approval_status" = 'draft',
        "notes" = excluded."notes",
        "updated_at" = CURRENT_TIMESTAMP
    `);
  }

  async upsertReferenceFamily(input: ReferenceAsset): Promise<void> {
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "erp_agent"."erp_sql_reference_family" (
        "family_id", "family_name", "module", "intent", "business_description", "core_tables",
        "core_joins", "common_params", "representative_dataset_id", "representative_sql",
        "sample_dataset_ids", "report_names", "dataset_names", "risk_flags", "recommended_use", "is_enabled"
      )
      VALUES (
        ${input.familyId}, ${input.familyName}, ${input.module}, ${input.intent}, ${input.businessDescription},
        ${JSON.stringify(input.coreTables)}::jsonb, ${JSON.stringify(input.coreJoins)}::jsonb,
        ${JSON.stringify(input.commonParams)}::jsonb, ${input.representativeDatasetId}, ${input.representativeSql},
        ${JSON.stringify(input.sampleDatasetIds)}::jsonb, ${JSON.stringify(input.reportNames)}::jsonb,
        ${JSON.stringify(input.datasetNames)}::jsonb, ${JSON.stringify(input.riskFlags)}::jsonb,
        'reference_retrieval', TRUE
      )
      ON CONFLICT ("family_id") DO UPDATE SET
        "family_name" = excluded."family_name",
        "module" = excluded."module",
        "intent" = excluded."intent",
        "business_description" = excluded."business_description",
        "core_tables" = excluded."core_tables",
        "core_joins" = excluded."core_joins",
        "common_params" = excluded."common_params",
        "representative_dataset_id" = excluded."representative_dataset_id",
        "representative_sql" = excluded."representative_sql",
        "sample_dataset_ids" = excluded."sample_dataset_ids",
        "report_names" = excluded."report_names",
        "dataset_names" = excluded."dataset_names",
        "risk_flags" = excluded."risk_flags",
        "recommended_use" = 'reference_retrieval',
        "is_enabled" = TRUE,
        "updated_at" = CURRENT_TIMESTAMP
    `);
  }

  async upsertMetricDraft(input: MetricAsset): Promise<void> {
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "erp_agent"."business_metric_catalog" (
        "metric_code", "metric_name", "module", "family_id", "business_description",
        "calculation_summary", "core_tables", "core_joins", "params", "representative_sql",
        "source_report_names", "source_dataset_ids", "status", "notes"
      )
      VALUES (
        ${input.metricCode}, ${input.metricName}, ${input.module}, ${input.familyId}, ${input.businessDescription},
        ${input.calculationSummary}, ${JSON.stringify(input.coreTables)}::jsonb, ${JSON.stringify(input.coreJoins)}::jsonb,
        ${JSON.stringify(input.params)}::jsonb, ${input.representativeSql}, ${JSON.stringify(input.sourceReportNames)}::jsonb,
        ${JSON.stringify(input.sourceDatasetIds)}::jsonb, 'draft', ${input.notes}
      )
      ON CONFLICT ("metric_code") DO UPDATE SET
        "metric_name" = excluded."metric_name",
        "module" = excluded."module",
        "family_id" = excluded."family_id",
        "business_description" = excluded."business_description",
        "calculation_summary" = excluded."calculation_summary",
        "core_tables" = excluded."core_tables",
        "core_joins" = excluded."core_joins",
        "params" = excluded."params",
        "representative_sql" = excluded."representative_sql",
        "source_report_names" = excluded."source_report_names",
        "source_dataset_ids" = excluded."source_dataset_ids",
        "status" = 'draft',
        "notes" = excluded."notes",
        "updated_at" = CURRENT_TIMESTAMP
    `);
  }

  async verifyFamilies(families: string[]): Promise<SqlFamilyAutoPromotionReport["verification"]> {
    const [templateDrafts, referenceFamilies, metricDrafts, unsafeTemplates] = await Promise.all([
      prisma.$queryRaw<Array<{ familyId: string; approved: boolean; approvalStatus: string; guardPassed: boolean; sourceType: string; sqlTemplate: string }>>(Prisma.sql`
        SELECT source_family_id AS "familyId", approved, approval_status AS "approvalStatus", guard_passed AS "guardPassed", source_type AS "sourceType", sql_template AS "sqlTemplate"
        FROM "erp_agent"."erp_query_templates"
        WHERE source_family_id IN (${Prisma.join(families)})
      `),
      prisma.$queryRaw<Array<{ familyId: string; recommendedUse: string; isEnabled: boolean }>>(Prisma.sql`
        SELECT family_id AS "familyId", recommended_use AS "recommendedUse", is_enabled AS "isEnabled"
        FROM "erp_agent"."erp_sql_reference_family"
        WHERE family_id IN (${Prisma.join(families)})
      `),
      prisma.$queryRaw<Array<{ familyId: string; status: string }>>(Prisma.sql`
        SELECT family_id AS "familyId", status
        FROM "erp_agent"."business_metric_catalog"
        WHERE family_id IN (${Prisma.join(families)})
      `),
      prisma.$queryRaw<Array<{ familyId: string }>>(Prisma.sql`
        SELECT source_family_id AS "familyId"
        FROM "erp_agent"."erp_query_templates"
        WHERE source_family_id IN (${Prisma.join(families)})
          AND (approved = TRUE OR approval_status <> 'draft' OR guard_passed = TRUE OR source_type <> 'finereport_family'
            OR sql_template ~* '\\$\\{|\\m(DECLARE|DROP|UPDATE|DELETE|INSERT|EXEC|EXECUTE)\\M|SELECT\\s+INTO\\s+#')
      `),
    ]);
    const failures = [
      ...unsafeTemplates.map((row) => `Template ${row.familyId} failed draft safety verification`),
      ...referenceFamilies.filter((row) => row.recommendedUse !== "reference_retrieval" || !row.isEnabled).map((row) => `Reference ${row.familyId} failed reference verification`),
      ...metricDrafts.filter((row) => row.status !== "draft").map((row) => `Metric ${row.familyId} failed draft verification`),
      ...templateDrafts
        .filter((row) => row.approved || row.approvalStatus !== "draft" || row.guardPassed || row.sourceType !== "finereport_family")
        .map((row) => `Template ${row.familyId} failed status verification`),
    ];
    return {
      summary: {
        templateDraftFound: templateDrafts.length,
        referenceFamilyFound: referenceFamilies.length,
        metricDraftFound: metricDrafts.length,
        failedCount: failures.length,
      },
      failures,
    };
  }
}

export const sqlFamilyAutoPromotionService = new SqlFamilyAutoPromotionService();

export async function writeSqlFamilyAutoPromotionOutputs(
  report: SqlFamilyAutoPromotionReport,
  options: { compactOut: string; out: string },
): Promise<void> {
  await fs.mkdir(path.dirname(path.resolve(options.compactOut)), { recursive: true });
  await fs.writeFile(options.compactOut, `${JSON.stringify(compactSqlFamilyAutoPromotionReport(report), null, 2)}\n`, "utf8");
  await fs.mkdir(path.dirname(path.resolve(options.out)), { recursive: true });
  await fs.writeFile(options.out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

export function compactSqlFamilyAutoPromotionReport(report: SqlFamilyAutoPromotionReport): SqlFamilyAutoPromotionCompactReport {
  return {
    kind: report.kind,
    batchId: report.batchId,
    summary: report.summary,
    appliedTemplates: report.appliedTemplates,
    downgradedReferences: report.downgradedReferences.map((item) => ({
      ...item,
      missingTables: item.missingTables.slice(0, 20),
      missingColumns: item.missingColumns.slice(0, 20),
      ...(item.errorSummary ? { errorSummary: truncate(item.errorSummary, 1000) } : {}),
    })),
    registeredMetricDrafts: report.registeredMetricDrafts,
    skippedFamilies: report.skippedFamilies,
    failures: report.failures.map((item) => ({ familyId: item.familyId, errorSummary: truncate(item.errorSummary, 1000) })),
  };
}

export function compactSummaryLine(report: SqlFamilyAutoPromotionReport): string {
  return [
    `COMPACT_SUMMARY batch=${report.batchId}`,
    `input=${report.summary.inputFamilies}`,
    `appliedTemplates=${report.summary.appliedTemplateDrafts}`,
    `downgradedReferences=${report.summary.downgradedReferences}`,
    `metricDrafts=${report.summary.registeredMetricDrafts}`,
    `skipped=${report.summary.skipped}`,
    `failed=${report.summary.failed}`,
  ].join(" ");
}

function buildTemplateAsset(family: BusinessFamily): TemplateAsset | undefined {
  const def = TEMPLATE_DEFS[family.familyId];
  if (!def) return undefined;
  const queryPlanJson = {
    intent: def.intent,
    module: def.module,
    tables: family.coreTables,
    joins: family.coreJoins,
    filters: def.optionalParams,
    params: { required: def.requiredParams, optional: def.optionalParams },
    sourceFamilyId: family.familyId,
    sourceReportNames: family.reportNames,
    limitations: [def.notes, "draft only; must pass guard and manual approval before execution"],
  };
  return {
    ...def,
    queryPlanJson,
    tables: family.coreTables,
    joins: family.coreJoins,
    sourceDatasetIds: family.sampleDatasetIds,
    sourceReportNames: family.reportNames,
    sourceSqlHashes: [],
  };
}

function buildReferenceAsset(family: BusinessFamily, reason: string): ReferenceAsset {
  const meta = REFERENCE_META[family.familyId] ?? {
    familyName: family.reportNames[0] ?? family.familyId,
    module: family.moduleGuess || "unknown",
    intent: `${family.familyId}_reference`,
    businessDescription: `${family.familyId} reference SQL family.`,
    reason,
  };
  return {
    familyId: family.familyId,
    familyName: meta.familyName,
    module: meta.module,
    intent: meta.intent,
    businessDescription: meta.businessDescription,
    coreTables: family.coreTables,
    coreJoins: family.coreJoins,
    commonParams: family.params,
    representativeDatasetId: family.representativeDatasetId,
    representativeSql: family.representativeSql,
    sampleDatasetIds: family.sampleDatasetIds,
    reportNames: family.reportNames,
    datasetNames: family.datasetNames,
    riskFlags: [...riskFlags(family), reason],
  };
}

function buildMetricAsset(family: BusinessFamily): MetricAsset {
  return {
    familyId: family.familyId,
    metricCode: `${family.familyId}_metric_draft`,
    metricName: family.reportNames[0] ?? family.familyId,
    module: family.moduleGuess || "unknown",
    businessDescription: `${family.reportNames.join(" / ")} 指标草稿。`,
    calculationSummary: "指标口径涉及聚合或敏感业务计算，本阶段只登记草稿，不进入可执行模板。",
    coreTables: family.coreTables,
    coreJoins: family.coreJoins,
    params: family.params,
    representativeSql: family.representativeSql,
    sourceReportNames: family.reportNames,
    sourceDatasetIds: family.sampleDatasetIds,
    notes: "auto-promote metric draft; not approved; not executable template",
  };
}

function applyLowRiskAutoFixes(template: TemplateAsset): { template: TemplateAsset; autoFixes: string[] } {
  const autoFixes: string[] = [];
  let sqlTemplate = template.sqlTemplate;
  sqlTemplate = replaceWithFix(sqlTemplate, /\bMtlPartNum\b/gu, "PartNum", "Erp.JobMtl.MtlPartNum -> Erp.JobMtl.PartNum", autoFixes);
  sqlTemplate = replaceWithFix(sqlTemplate, /\b(wh|c)\.Name\b/gu, "$1.Description", "Erp.Warehse.Name -> Erp.Warehse.Description", autoFixes);
  if (/DATEADD\s*\(\s*day\s*,\s*@daysBeforeDue\s*,\s*CAST\s*\(\s*GETDATE\s*\(\s*\)\s+AS\s+date\s*\)\s*\)/iu.test(sqlTemplate)) {
    sqlTemplate = sqlTemplate.replace(/DATEADD\s*\(\s*day\s*,\s*@daysBeforeDue\s*,\s*CAST\s*\(\s*GETDATE\s*\(\s*\)\s+AS\s+date\s*\)\s*\)/giu, "@dueBeforeDate");
    autoFixes.push("DATEADD(day, @daysBeforeDue, CAST(GETDATE() AS date)) -> @dueBeforeDate");
  }
  if (!autoFixes.length) return { template, autoFixes };
  const optionalParams = template.optionalParams.map((param) => (param === "daysBeforeDue" ? "dueBeforeDate" : param));
  const finalOptionalParams = optionalParams.includes("dueBeforeDate") ? optionalParams : optionalParams.concat("dueBeforeDate");
  return {
    template: {
      ...template,
      sqlTemplate,
      optionalParams: finalOptionalParams.filter((param, index, array) => array.indexOf(param) === index),
      queryPlanJson: updateQueryPlanParams(template.queryPlanJson),
      notes: `${template.notes} Auto-fixes: ${autoFixes.join("; ")}.`,
    },
    autoFixes,
  };
}

function updateQueryPlanParams(queryPlanJson: Record<string, unknown>): Record<string, unknown> {
  const json = JSON.parse(JSON.stringify(queryPlanJson)) as Record<string, unknown>;
  json.filters = replaceParamArray(json.filters);
  const params = json.params && typeof json.params === "object" ? (json.params as Record<string, unknown>) : {};
  params.optional = replaceParamArray(params.optional);
  json.params = params;
  return json;
}

function replaceParamArray(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  const replaced = value.map((item) => (item === "daysBeforeDue" ? "dueBeforeDate" : item));
  return replaced.includes("dueBeforeDate") ? replaced.filter((item, index) => replaced.indexOf(item) === index) : replaced;
}

function replaceWithFix(sql: string, pattern: RegExp, replacement: string, fixName: string, fixes: string[]): string {
  if (!pattern.test(sql)) return sql;
  fixes.push(fixName);
  pattern.lastIndex = 0;
  return sql.replace(pattern, replacement);
}

function summarizeValidation(validation: SqlTemplateDraftValidationReport["templates"][number]): FamilyValidationSummary {
  const missingColumns = validation.schemaValidation.missingColumns.map((column) => `${column.table}.${column.column}`);
  const missingTables = [
    ...new Set((validation.schemaValidation.errors ?? []).map((error) => /Metadata query failed for ([^:]+):/u.exec(error)?.[1]).filter((item): item is string => Boolean(item))),
  ];
  const errors = [
    ...(validation.schemaValidation.errors ?? []),
    validation.compileValidation.error ?? validation.compileValidation.rawExecutorErrorMessage ?? "",
  ].filter(Boolean);
  return {
    schemaStatus: validation.schemaValidation.status,
    compileStatus: validation.compileValidation.status,
    missingTables: missingTables.slice(0, 20),
    missingColumns: missingColumns.slice(0, 20),
    ...(errors.length ? { errorSummary: errors.join("; ") } : {}),
  };
}

function isTemplatePass(validation: SqlTemplateDraftValidationReport["templates"][number]): boolean {
  return validation.schemaValidation.status === "pass" && validation.compileValidation.status === "pass";
}

function isValidationInfrastructureFailure(validation: SqlTemplateDraftValidationReport["templates"][number]): boolean {
  const text = [
    ...(validation.schemaValidation.errors ?? []),
    validation.compileValidation.error ?? "",
    validation.compileValidation.rawExecutorErrorMessage ?? "",
  ].join(" ");
  return /ERP_QUERY_(?:API_KEY|CRYPTO_SECRET) is required|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|query backend/i.test(text);
}

function findValidation(report: SqlTemplateDraftValidationReport | undefined, familyId: string): SqlTemplateDraftValidationReport["templates"][number] | undefined {
  return report?.templates.find((template) => template.familyId === familyId);
}

function isMetricFamily(family: BusinessFamily): boolean {
  const text = `${family.reportNames.join(" ")} ${family.datasetNames.join(" ")}`;
  return METRIC_PATTERNS.test(text);
}

function directReferenceReason(familyId: string): string {
  return REFERENCE_META[familyId]?.reason ?? "reference_only";
}

function riskFlags(family: BusinessFamily): string[] {
  const flags: string[] = [];
  if ((family.hasFanruanMacroCount ?? 0) > 0) flags.push("finereport_macro_in_source");
  if ((family.hasNonSelectRiskCount ?? 0) > 0) flags.push("non_select_risk_in_source");
  if ((family.hasHardcodedCompanyCount ?? 0) > 0) flags.push("hardcoded_company_in_source");
  return flags;
}

function paramMap(params: string[], required: boolean) {
  return Object.fromEntries(params.map((name) => [name, { required }]));
}

function emptyReport(batchId: string, options: SqlFamilyAutoPromotionOptions): SqlFamilyAutoPromotionReport {
  return {
    kind: "auto_promote_compact_report",
    batchId,
    mode: options.apply ? "apply" : "dry_run",
    summary: {
      inputFamilies: options.families.length,
      appliedTemplateDrafts: 0,
      downgradedReferences: 0,
      registeredMetricDrafts: 0,
      skipped: 0,
      failed: 0,
    },
    appliedTemplates: [],
    downgradedReferences: [],
    registeredMetricDrafts: [],
    skippedFamilies: [],
    failures: [],
    candidates: [],
    validationReports: [],
  };
}

function refreshSummary(report: SqlFamilyAutoPromotionReport, inputFamilies: number): void {
  report.summary = {
    inputFamilies,
    appliedTemplateDrafts: report.appliedTemplates.length,
    downgradedReferences: report.downgradedReferences.length,
    registeredMetricDrafts: report.registeredMetricDrafts.length,
    skipped: report.skippedFamilies.length,
    failed: report.failures.length + (report.verification?.summary.failedCount ?? 0),
  };
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}

async function readJson<T>(filePath: string, label: string): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error(`Missing ${label} file: ${filePath}`);
    throw new Error(`Invalid ${label} file: ${filePath}`);
  }
}
