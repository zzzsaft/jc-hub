import fs from "node:fs/promises";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { prisma } from "../../../../lib/prisma.js";

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

type BusinessSamplesFile = { businessFamilies?: BusinessFamily[] };
type ClassificationFile = { families?: Array<{ familyId?: string }> };

export type SqlFamilyAssetPromotionOptions = {
  classificationPath: string;
  businessSamplesPath: string;
  apply?: boolean;
};

export type SqlFamilyAssetPromotionReport = {
  summary: {
    templateDraftCount: number;
    referenceFamilyCount: number;
    metricDraftCount: number;
    skippedCount: number;
  };
  templateDrafts: Array<TemplateAsset & { action: "dry_run" | "upserted" }>;
  referenceFamilies: Array<ReferenceAsset & { action: "dry_run" | "upserted" }>;
  metricDrafts: Array<MetricAsset & { action: "dry_run" | "upserted" }>;
  skippedFamilies: Array<{ familyId: string; reason: string }>;
};

export type SqlFamilyPromotionReviewOutputOptions = {
  reviewOut?: string;
  jsonOut?: string;
  applyCommand?: string;
};

export type SqlFamilyAssetRepository = {
  upsertTemplateDraft(input: TemplateAsset): Promise<void>;
  upsertReferenceFamily(input: ReferenceAsset): Promise<void>;
  upsertMetricDraft(input: MetricAsset): Promise<void>;
};

type TemplateAsset = ReturnType<typeof buildTemplateAsset>;
type ReferenceAsset = ReturnType<typeof buildReferenceAsset>;
type MetricAsset = ReturnType<typeof buildMetricAsset>;

const TEMPLATE_FAMILY_IDS = ["family_050", "family_062", "family_076", "family_016", "family_037"] as const;
const REFERENCE_FAMILY_IDS = ["family_002", "family_009", "family_021", "family_023", "family_025", "family_035", "family_075"] as const;
const METRIC_FAMILY_IDS = ["family_013", "family_024", "family_036", "family_057", "family_059"] as const;

const TEMPLATE_DEFS = {
  family_050: {
    name: "库存明细查询",
    intent: "inventory_stock_detail",
    module: "inventory",
    questionPattern: "按物料、仓库、库位、产品群组查询库存明细",
    normalizedQuestion: "库存明细查询",
    optionalParams: ["companyScope", "partNum", "partDescription", "warehouseCode", "binNum", "prodCode", "classId", "onlyNonZeroStock"],
    fields: ["Company", "PartNum", "PartDescription", "WarehouseCode", "BinNum", "OnhandQty", "ProdCode", "ClassID"],
    notes: "草稿来自 family_050；Company 使用 @companyScope 控制，不硬编码公司、仓库或产品编码。",
    sql: `SELECT TOP 100
  p.Company AS [公司],
  p.PartNum AS [物料编号],
  p.PartDescription AS [物料描述],
  pw.WarehouseCode AS [仓库],
  pb.BinNum AS [库位],
  pb.OnhandQty AS [库位库存],
  pw.OnHandQty AS [仓库库存],
  p.ProdCode AS [产品群组],
  p.ClassID AS [物料分类],
  wh.Name AS [仓库名称]
FROM Erp.Part p
INNER JOIN Erp.PartWhse pw ON pw.Company = p.Company AND pw.PartNum = p.PartNum
LEFT JOIN Erp.PartBin pb ON pb.Company = pw.Company AND pb.PartNum = pw.PartNum AND pb.WarehouseCode = pw.WarehouseCode
LEFT JOIN Erp.WhseBin wb ON wb.Company = pb.Company AND wb.WarehouseCode = pb.WarehouseCode AND wb.BinNum = pb.BinNum
LEFT JOIN Erp.Warehse wh ON wh.Company = pw.Company AND wh.WarehouseCode = pw.WarehouseCode
LEFT JOIN Erp.ProdGrup pg ON pg.Company = p.Company AND pg.ProdCode = p.ProdCode
LEFT JOIN Erp.PartClass pc ON pc.Company = p.Company AND pc.ClassID = p.ClassID
WHERE (@companyScope IS NULL OR p.Company = @companyScope)
  AND (@partNum IS NULL OR p.PartNum = @partNum)
  AND (@partDescription IS NULL OR p.PartDescription LIKE CONCAT('%', @partDescription, '%'))
  AND (@warehouseCode IS NULL OR pw.WarehouseCode = @warehouseCode)
  AND (@binNum IS NULL OR pb.BinNum = @binNum)
  AND (@prodCode IS NULL OR p.ProdCode = @prodCode)
  AND (@classId IS NULL OR p.ClassID = @classId)
  AND (@onlyNonZeroStock = 0 OR COALESCE(pb.OnhandQty, pw.OnHandQty, 0) <> 0)`,
  },
  family_062: {
    name: "采购到货跟踪查询",
    intent: "purchase_receipt_delay_tracking",
    module: "purchase",
    questionPattern: "查询采购未到货、延期到货、供应商和采购员到货跟踪",
    normalizedQuestion: "采购到货跟踪查询",
    optionalParams: ["companyScope", "poNum", "vendorName", "buyerName", "partNum", "dueDateFrom", "dueDateTo", "receiptDateFrom", "receiptDateTo", "onlyOpen", "onlyDelayed", "dueBeforeDate"],
    fields: ["PONum", "POLine", "PORelNum", "PartNum", "XOrderQty", "ReceivedQty", "DueDate", "PromiseDt"],
    notes: "草稿来自 family_062；RcvDtl 聚合和 PORel.DueDate/PromiseDt 字段需按现场 Epicor 字段验证。",
    sql: `SELECT TOP 100
  poh.Company AS [公司],
  poh.PONum AS [采购单号],
  pod.POLine AS [采购行],
  por.PORelNum AS [采购释放],
  v.Name AS [供应商],
  pa.Name AS [采购员],
  pod.PartNum AS [物料编号],
  pod.LineDesc AS [物料描述],
  por.DueDate AS [交期],
  por.PromiseDt AS [承诺日期],
  por.XRelQty AS [订购数量],
  COALESCE(rcv.ReceivedQty, 0) AS [已收数量],
  por.XRelQty - COALESCE(rcv.ReceivedQty, 0) AS [未到数量],
  rcv.LastReceiptDate AS [最近收货日期],
  CASE WHEN COALESCE(rcv.ReceivedQty, 0) < por.XRelQty AND COALESCE(por.PromiseDt, por.DueDate) < CAST(GETDATE() AS date) THEN 1 ELSE 0 END AS [是否延期]
FROM Erp.POHeader poh
INNER JOIN Erp.PODetail pod ON pod.Company = poh.Company AND pod.PONum = poh.PONum
INNER JOIN Erp.PORel por ON por.Company = pod.Company AND por.PONum = pod.PONum AND por.POLine = pod.POLine
LEFT JOIN Erp.Vendor v ON v.Company = poh.Company AND v.VendorNum = poh.VendorNum
LEFT JOIN Erp.PurAgent pa ON pa.Company = poh.Company AND pa.BuyerID = poh.BuyerID
LEFT JOIN (
  SELECT Company, PONum, POLine, PORelNum, SUM(OurQty) AS ReceivedQty, MAX(ReceiptDate) AS LastReceiptDate
  FROM Erp.RcvDtl
  GROUP BY Company, PONum, POLine, PORelNum
) rcv ON rcv.Company = por.Company AND rcv.PONum = por.PONum AND rcv.POLine = por.POLine AND rcv.PORelNum = por.PORelNum
WHERE (@companyScope IS NULL OR poh.Company = @companyScope)
  AND (@poNum IS NULL OR poh.PONum = @poNum)
  AND (@vendorName IS NULL OR v.Name LIKE CONCAT('%', @vendorName, '%'))
  AND (@buyerName IS NULL OR pa.Name LIKE CONCAT('%', @buyerName, '%'))
  AND (@partNum IS NULL OR pod.PartNum = @partNum)
  AND (@dueDateFrom IS NULL OR COALESCE(por.PromiseDt, por.DueDate) >= @dueDateFrom)
  AND (@dueDateTo IS NULL OR COALESCE(por.PromiseDt, por.DueDate) <= @dueDateTo)
  AND (@receiptDateFrom IS NULL OR rcv.LastReceiptDate >= @receiptDateFrom)
  AND (@receiptDateTo IS NULL OR rcv.LastReceiptDate <= @receiptDateTo)
  AND (@onlyOpen = 0 OR COALESCE(rcv.ReceivedQty, 0) < por.XRelQty)
  AND (@onlyDelayed = 0 OR (COALESCE(rcv.ReceivedQty, 0) < por.XRelQty AND COALESCE(por.PromiseDt, por.DueDate) < CAST(GETDATE() AS date)))
  AND (@dueBeforeDate IS NULL OR COALESCE(por.PromiseDt, por.DueDate) <= @dueBeforeDate)`,
  },
  family_076: {
    name: "工单物料需求查询",
    intent: "job_material_requirement_shortage",
    module: "production_inventory",
    questionPattern: "查询工单物料需求、未发料和缺料明细",
    normalizedQuestion: "工单物料需求查询",
    optionalParams: ["companyScope", "jobNum", "materialPartNum", "parentPartNum", "reqDueDateFrom", "reqDueDateTo", "warehouseCode", "onlyUnissued", "onlyShortage"],
    fields: ["JobNum", "PartNum", "RequiredQty", "IssuedQty", "OnHandQty", "ReqDate"],
    notes: "草稿来自 family_076；缺料暂按 OnHandQty < RequiredQty - IssuedQty，业务口径需人工确认。数据库验证显示 JobMtl.PartNum 与 JobMtl.BasePartNum 均存在且可编译；第一版采用 JobMtl.PartNum 作为工单物料需求行的需求物料字段。",
    sql: `SELECT TOP 100
  jm.Company AS [公司],
  jm.JobNum AS [工单号],
  jh.PartNum AS [成品物料],
  jm.PartNum AS [需求物料],
  p.PartDescription AS [物料描述],
  jm.RequiredQty AS [需求数量],
  jm.IssuedQty AS [已发数量],
  jm.RequiredQty - jm.IssuedQty AS [未发数量],
  pw.WarehouseCode AS [仓库],
  COALESCE(pw.OnHandQty, 0) AS [现有库存],
  jm.ReqDate AS [需求日期],
  CASE WHEN COALESCE(pw.OnHandQty, 0) < jm.RequiredQty - jm.IssuedQty THEN 1 ELSE 0 END AS [是否缺料]
FROM Erp.JobMtl jm
INNER JOIN Erp.JobHead jh ON jh.Company = jm.Company AND jh.JobNum = jm.JobNum
LEFT JOIN Erp.Part p ON p.Company = jm.Company AND p.PartNum = jm.PartNum
LEFT JOIN Erp.PartWhse pw ON pw.Company = jm.Company AND pw.PartNum = jm.PartNum
LEFT JOIN Erp.PartClass pc ON pc.Company = p.Company AND pc.ClassID = p.ClassID
WHERE (@companyScope IS NULL OR jm.Company = @companyScope)
  AND (@jobNum IS NULL OR jm.JobNum = @jobNum)
  AND (@materialPartNum IS NULL OR jm.PartNum = @materialPartNum)
  AND (@parentPartNum IS NULL OR jh.PartNum = @parentPartNum)
  AND (@reqDueDateFrom IS NULL OR jm.ReqDate >= @reqDueDateFrom)
  AND (@reqDueDateTo IS NULL OR jm.ReqDate <= @reqDueDateTo)
  AND (@warehouseCode IS NULL OR pw.WarehouseCode = @warehouseCode)
  AND (@onlyUnissued = 0 OR jm.RequiredQty > jm.IssuedQty)
  AND (@onlyShortage = 0 OR COALESCE(pw.OnHandQty, 0) < jm.RequiredQty - jm.IssuedQty)`,
  },
  family_016: {
    name: "销售订单明细查询",
    intent: "sales_order_detail",
    module: "sales",
    questionPattern: "查询销售订单、客户订单、产品订单和未关闭订单",
    normalizedQuestion: "销售订单明细查询",
    optionalParams: ["companyScope", "orderNum", "customerName", "entryPerson", "partNum", "prodCode", "orderDateFrom", "orderDateTo", "requestDateFrom", "requestDateTo", "onlyOpen"],
    fields: ["OrderNum", "OrderLine", "CustNum", "PartNum", "OrderQty", "DocExtPriceDtl", "OrderDate", "RequestDate"],
    notes: "草稿来自 family_016；EntryPerson、ProdCode 均为可选参数，不硬编码前缀。",
    sql: `SELECT TOP 100
  oh.Company AS [公司],
  oh.OrderNum AS [订单号],
  od.OrderLine AS [订单行],
  c.Name AS [客户],
  oh.EntryPerson AS [录入人],
  od.PartNum AS [物料编号],
  od.LineDesc AS [物料描述],
  od.OrderQty AS [下单数量],
  od.DocExtPriceDtl AS [签约金额],
  oh.OrderDate AS [下单日期],
  od.RequestDate AS [需求日期],
  od.OpenLine AS [行是否未关闭]
FROM Erp.OrderHed oh
INNER JOIN Erp.OrderDtl od ON od.Company = oh.Company AND od.OrderNum = oh.OrderNum
LEFT JOIN Erp.Customer c ON c.Company = oh.Company AND c.CustNum = oh.CustNum
LEFT JOIN Erp.Part p ON p.Company = od.Company AND p.PartNum = od.PartNum
LEFT JOIN Erp.ProdGrup pg ON pg.Company = p.Company AND pg.ProdCode = p.ProdCode
WHERE (@companyScope IS NULL OR oh.Company = @companyScope)
  AND (@orderNum IS NULL OR oh.OrderNum = @orderNum)
  AND (@customerName IS NULL OR c.Name LIKE CONCAT('%', @customerName, '%'))
  AND (@entryPerson IS NULL OR oh.EntryPerson LIKE CONCAT(@entryPerson, '%'))
  AND (@partNum IS NULL OR od.PartNum = @partNum)
  AND (@prodCode IS NULL OR p.ProdCode = @prodCode)
  AND (@orderDateFrom IS NULL OR oh.OrderDate >= @orderDateFrom)
  AND (@orderDateTo IS NULL OR oh.OrderDate <= @orderDateTo)
  AND (@requestDateFrom IS NULL OR od.RequestDate >= @requestDateFrom)
  AND (@requestDateTo IS NULL OR od.RequestDate <= @requestDateTo)
  AND (@onlyOpen = 0 OR od.OpenLine = 1)`,
  },
  family_037: {
    name: "发货通知明细查询",
    intent: "sales_shipping_notice_detail",
    module: "sales_inventory",
    questionPattern: "查询发货通知、待发货订单、客户收货信息和库存",
    normalizedQuestion: "发货通知明细查询",
    optionalParams: ["companyScope", "orderNum", "customerName", "partNum", "prodCode", "requestDateFrom", "requestDateTo", "warehouseCode", "onlyOpenRelease", "onlyShippingNotice"],
    fields: ["OrderNum", "OrderLine", "OrderRelNum", "PartNum", "RequestDate", "WarehouseCode", "OnHandQty"],
    notes: "草稿来自 family_037；CheckBox20/CheckBox18/CheckBox19/Date20/Date19/ShortChar10 等 UD 字段待业务确认。",
    sql: `SELECT TOP 100
  od.Company AS [公司],
  od.OrderNum AS [订单号],
  od.OrderLine AS [订单行],
  rel.OrderRelNum AS [释放号],
  c.Name AS [客户],
  st.Name AS [收货方],
  od.PartNum AS [物料编号],
  od.LineDesc AS [物料描述],
  od.OrderQty AS [订单数量],
  rel.OurReqQty AS [待发数量],
  rel.ReqDate AS [需求日期],
  rel.WarehouseCode AS [仓库],
  COALESCE(pw.OnHandQty, 0) AS [仓库库存],
  cc.Name AS [联系人]
FROM Erp.OrderDtl od
INNER JOIN Erp.OrderRel rel ON rel.Company = od.Company AND rel.OrderNum = od.OrderNum AND rel.OrderLine = od.OrderLine
INNER JOIN Erp.OrderHed oh ON oh.Company = od.Company AND oh.OrderNum = od.OrderNum
LEFT JOIN Erp.Customer c ON c.Company = oh.Company AND c.CustNum = oh.CustNum
LEFT JOIN Erp.ShipTo st ON st.Company = rel.Company AND st.CustNum = oh.CustNum AND st.ShipToNum = rel.ShipToNum
LEFT JOIN Erp.CustCnt cc ON cc.Company = st.Company AND cc.CustNum = st.CustNum AND cc.ShipToNum = st.ShipToNum
LEFT JOIN Erp.JobProd jp ON jp.Company = od.Company AND jp.OrderNum = od.OrderNum AND jp.OrderLine = od.OrderLine
LEFT JOIN Erp.PartWhse pw ON pw.Company = od.Company AND pw.PartNum = od.PartNum AND pw.WarehouseCode = rel.WarehouseCode
LEFT JOIN Erp.Part p ON p.Company = od.Company AND p.PartNum = od.PartNum
WHERE (@companyScope IS NULL OR od.Company = @companyScope)
  AND (@orderNum IS NULL OR od.OrderNum = @orderNum)
  AND (@customerName IS NULL OR c.Name LIKE CONCAT('%', @customerName, '%'))
  AND (@partNum IS NULL OR od.PartNum = @partNum)
  AND (@prodCode IS NULL OR p.ProdCode = @prodCode)
  AND (@requestDateFrom IS NULL OR rel.ReqDate >= @requestDateFrom)
  AND (@requestDateTo IS NULL OR rel.ReqDate <= @requestDateTo)
  AND (@warehouseCode IS NULL OR rel.WarehouseCode = @warehouseCode)
  AND (@onlyOpenRelease = 0 OR rel.OpenRelease = 1)
  AND (@onlyShippingNotice = 0 OR rel.OurReqQty > 0)`,
  },
} satisfies Record<(typeof TEMPLATE_FAMILY_IDS)[number], {
  name: string;
  intent: string;
  module: string;
  questionPattern: string;
  normalizedQuestion: string;
  optionalParams: string[];
  fields: string[];
  notes: string;
  sql: string;
}>;

const REFERENCE_META: Record<string, { familyName: string; module: string; intent: string; businessDescription: string }> = {
  family_002: { familyName: "生产任务 / 今日任务 / 明日任务 / 拉动式生产", module: "production", intent: "production_task_pull_schedule_reference", businessDescription: "生产任务、今日/明日任务、拉动式生产过程参考 SQL family。" },
  family_009: { familyName: "生产任务执行 / 过程跟进", module: "production", intent: "production_task_execution_followup_reference", businessDescription: "生产任务执行、过程跟进和完工时间筛选参考 SQL family。" },
  family_021: { familyName: "销售订单 - 工单 - 工序进度", module: "cross_module", intent: "sales_order_job_operation_progress_reference", businessDescription: "销售订单、工单、工序进度跨模块追踪参考 SQL family。" },
  family_023: { familyName: "打光 / 完工分析 / 全局数据表", module: "cross_module", intent: "polishing_completion_global_reference", businessDescription: "打光、完工分析和全局数据表参考 SQL family。" },
  family_025: { familyName: "订单任务 + joboper 全局数据表", module: "cross_module", intent: "order_task_joboper_global_reference", businessDescription: "订单任务和 JobOper 全局过程数据参考 SQL family。" },
  family_035: { familyName: "外协分析 / 喷丝板 / 熔喷进度", module: "cross_module", intent: "outsourcing_spinneret_meltblown_progress_reference", businessDescription: "外协分析、喷丝板和熔喷进度参考 SQL family。" },
  family_075: { familyName: "澄江报工明细", module: "production", intent: "chengjiang_labor_detail_reference", businessDescription: "澄江报工明细、工序部门和人员报工参考 SQL family。" },
};

const METRIC_META: Record<string, { metricCode: string; metricName: string; module: string; businessDescription: string; calculationSummary: string; notes: string }> = {
  family_013: { metricCode: "purchase_on_time_delivery_rate", metricName: "采购及时率 / 供应商及时率 / 采购延期", module: "purchase", businessDescription: "采购及时率、供应商及时率和采购延期指标草稿。", calculationSummary: "基于采购交期、收货日期、采购释放和收货明细计算及时/延期口径。", notes: "指标口径复杂，本阶段只登记草稿，不进入可执行模板。" },
  family_024: { metricCode: "production_labor_hours_summary", metricName: "工时统计", module: "production", businessDescription: "生产工时、车间工时和人员加工工时统计指标草稿。", calculationSummary: "基于 LaborDtl、JobOper、ResourceGroup 等汇总工时。", notes: "需确认工时字段、重复提交处理和班组口径。" },
  family_036: { metricCode: "inventory_transaction_running_balance", metricName: "中国式库存记录 / 进销存", module: "inventory", businessDescription: "库存进出记录、历史消耗和进销存余额指标草稿。", calculationSummary: "基于 PartTran、Part、PartWhse 按日期范围汇总入出库和结余。", notes: "需确认期初、消耗值、财务类别和仓库范围口径。" },
  family_057: { metricCode: "production_completion_on_time_rate", metricName: "完工及时率", module: "production", businessDescription: "完工及时率、年月完工及时统计指标草稿。", calculationSummary: "基于销售交期、工单完工和发货相关日期统计及时/延期完成。", notes: "及时率口径复杂，本阶段只登记草稿。" },
  family_059: { metricCode: "production_cost_detail", metricName: "成本数据表", module: "finance", businessDescription: "生产成本数据表和成本明细指标草稿。", calculationSummary: "基于工单、工序、报工、物料事务和成本扩展表整理成本明细。", notes: "成本敏感且口径复杂，本阶段只登记草稿，不生成可执行模板。" },
};

export class SqlFamilyAssetPromotionService {
  constructor(private readonly repository: SqlFamilyAssetRepository = new PrismaSqlFamilyAssetRepository()) {}

  async promote(options: SqlFamilyAssetPromotionOptions): Promise<SqlFamilyAssetPromotionReport> {
    const classification = await readJson<ClassificationFile>(options.classificationPath, "classification");
    const samples = await readJson<BusinessSamplesFile>(options.businessSamplesPath, "business samples");
    if (!Array.isArray(classification.families)) throw new Error("classification file must contain a families array");
    if (!Array.isArray(samples.businessFamilies)) throw new Error("business samples file must contain a businessFamilies array");

    const families = new Map(samples.businessFamilies.map((family) => [family.familyId, family]));
    const report: SqlFamilyAssetPromotionReport = {
      summary: { templateDraftCount: 0, referenceFamilyCount: 0, metricDraftCount: 0, skippedCount: 0 },
      templateDrafts: [],
      referenceFamilies: [],
      metricDrafts: [],
      skippedFamilies: [],
    };

    for (const familyId of TEMPLATE_FAMILY_IDS) {
      const family = families.get(familyId);
      if (!family) {
        skip(report, familyId, "missing business sample");
        continue;
      }
      const asset = buildTemplateAsset(family);
      if (options.apply) await this.repository.upsertTemplateDraft(asset);
      report.templateDrafts.push({ ...asset, action: options.apply ? "upserted" : "dry_run" });
    }

    for (const familyId of REFERENCE_FAMILY_IDS) {
      const family = families.get(familyId);
      if (!family) {
        skip(report, familyId, "missing business sample");
        continue;
      }
      const asset = buildReferenceAsset(family);
      if (options.apply) await this.repository.upsertReferenceFamily(asset);
      report.referenceFamilies.push({ ...asset, action: options.apply ? "upserted" : "dry_run" });
    }

    for (const familyId of METRIC_FAMILY_IDS) {
      const family = families.get(familyId);
      if (!family) {
        skip(report, familyId, "missing business sample");
        continue;
      }
      const asset = buildMetricAsset(family);
      if (options.apply) await this.repository.upsertMetricDraft(asset);
      report.metricDrafts.push({ ...asset, action: options.apply ? "upserted" : "dry_run" });
    }

    report.summary.templateDraftCount = report.templateDrafts.length;
    report.summary.referenceFamilyCount = report.referenceFamilies.length;
    report.summary.metricDraftCount = report.metricDrafts.length;
    report.summary.skippedCount = report.skippedFamilies.length;
    return report;
  }
}

class PrismaSqlFamilyAssetRepository implements SqlFamilyAssetRepository {
  async upsertTemplateDraft(input: TemplateAsset): Promise<void> {
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "erp_agent"."erp_query_templates" (
        "name", "intent", "module", "question_pattern", "normalized_question", "query_plan_json",
        "sql_template", "required_params", "optional_params", "tables", "fields", "joins",
        "source_type", "source_family_id", "source_dataset_ids", "source_report_names", "source_sql_hashes",
        "guard_passed", "approved", "approval_status", "notes", "usage_count", "success_count"
      )
      VALUES (
        ${input.name}, ${input.intent}, ${input.module}, ${input.questionPattern}, ${input.normalizedQuestion},
        ${JSON.stringify(input.queryPlanJson)}::jsonb, ${input.sqlTemplate}, '{}'::jsonb,
        ${JSON.stringify(paramMap(input.optionalParams))}::jsonb, ${JSON.stringify(input.tables)}::jsonb,
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
}

export const sqlFamilyAssetPromotionService = new SqlFamilyAssetPromotionService();

export async function writeSqlFamilyPromotionReviewOutputs(
  report: SqlFamilyAssetPromotionReport,
  options: SqlFamilyPromotionReviewOutputOptions,
): Promise<void> {
  if (options.reviewOut) {
    await fs.mkdir(path.dirname(path.resolve(options.reviewOut)), { recursive: true });
    await fs.writeFile(options.reviewOut, buildSqlFamilyPromotionReviewMarkdown(report, options.applyCommand), "utf8");
  }
  if (options.jsonOut) {
    await fs.mkdir(path.dirname(path.resolve(options.jsonOut)), { recursive: true });
    await fs.writeFile(options.jsonOut, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
}

export function buildSqlFamilyPromotionReviewMarkdown(report: SqlFamilyAssetPromotionReport, applyCommand?: string): string {
  const lines = [
    "# SQL Family Promotion Review",
    "",
    "## Summary",
    "",
    bullet("templateDraftCount", report.summary.templateDraftCount),
    bullet("referenceFamilyCount", report.summary.referenceFamilyCount),
    bullet("metricDraftCount", report.summary.metricDraftCount),
    bullet("skippedCount", report.summary.skippedCount),
    "",
    "## Template Drafts Review",
    "",
    ...report.templateDrafts.flatMap(renderTemplateDraft),
    "## Reference Families Review",
    "",
    ...report.referenceFamilies.flatMap(renderReferenceFamily),
    "## Metric Drafts Review",
    "",
    ...report.metricDrafts.flatMap(renderMetricDraft),
    "## Guard Checklist",
    "",
    "- [ ] dry-run review completed",
    "- [ ] no template is approved automatically",
    "- [ ] no ERP report SQL was executed",
    "- [ ] no reference or metric family enters erp_query_templates",
    "",
    "## Apply Command",
    "",
    "```bash",
    applyCommand ?? "npm run sql-family:promote-assets -- --classification=./tmp/sql-family-business-usability-classification.json --business-samples=./tmp/sql-family-business-samples.json --apply",
    "```",
    "",
  ];
  return `${lines.join("\n")}`;
}

export function compactSqlFamilyPromotionReport(report: SqlFamilyAssetPromotionReport) {
  return {
    summary: report.summary,
    templateDrafts: report.templateDrafts.map((template) => ({
      familyId: template.familyId,
      name: template.name,
      intent: template.intent,
      action: template.action,
    })),
    referenceFamilies: report.referenceFamilies.map((reference) => ({
      familyId: reference.familyId,
      familyName: reference.familyName,
      intent: reference.intent,
      action: reference.action,
    })),
    metricDrafts: report.metricDrafts.map((metric) => ({
      familyId: metric.familyId,
      metricCode: metric.metricCode,
      metricName: metric.metricName,
      action: metric.action,
    })),
    skippedFamilies: report.skippedFamilies,
  };
}

function buildTemplateAsset(family: BusinessFamily) {
  const def = TEMPLATE_DEFS[family.familyId as keyof typeof TEMPLATE_DEFS];
  if (!def) throw new Error(`Unsupported template family: ${family.familyId}`);
  return {
    familyId: family.familyId,
    name: def.name,
    intent: def.intent,
    module: def.module,
    questionPattern: def.questionPattern,
    normalizedQuestion: def.normalizedQuestion,
    queryPlanJson: {
      intent: def.intent,
      module: def.module,
      tables: family.coreTables,
      joins: family.coreJoins,
      filters: def.optionalParams,
      params: { required: [], optional: def.optionalParams },
      sourceFamilyId: family.familyId,
      sourceReportNames: family.reportNames,
      limitations: [def.notes, "draft only; must pass guard and manual approval before execution"],
    },
    sqlTemplate: def.sql,
    requiredParams: [],
    optionalParams: def.optionalParams,
    tables: family.coreTables,
    fields: def.fields,
    joins: family.coreJoins,
    sourceDatasetIds: family.sampleDatasetIds,
    sourceReportNames: family.reportNames,
    sourceSqlHashes: [],
    notes: def.notes,
  };
}

function renderTemplateDraft(template: TemplateAsset & { action: string }): string[] {
  return [
    `### ${template.familyId} - ${template.name}`,
    "",
    bullet("family_id", template.familyId),
    bullet("template_name", template.name),
    bullet("intent", template.intent),
    bullet("module", template.module),
    bullet("source_report_names", template.sourceReportNames),
    bullet("source_dataset_ids", template.sourceDatasetIds),
    bullet("required_params", template.requiredParams),
    bullet("optional_params", template.optionalParams),
    bullet("tables", template.tables),
    bullet("joins", template.joins),
    "",
    "sql_template",
    "",
    "```sql",
    template.sqlTemplate,
    "```",
    "",
    "query_plan_json",
    "",
    "```json",
    JSON.stringify(template.queryPlanJson, null, 2),
    "```",
    "",
    bullet("notes", template.notes),
    "",
    "- [ ] SQL 是 SELECT-only",
    "- [ ] 不包含 FineReport 宏 `${...}`",
    "- [ ] 不包含 DECLARE / EXEC / DROP / INSERT / UPDATE / DELETE",
    "- [ ] 不包含 SELECT INTO #temp",
    "- [ ] 没有硬编码 jctimes / JingyiMT / jytimes",
    "- [ ] Company 过滤使用参数或 companyScope",
    "- [ ] 核心 JOIN 带 Company",
    "- [ ] 参数命名清楚",
    "- [ ] 字段名已按真实 ERP schema 校验",
    "- [ ] 业务口径与 source family 基本一致",
    "",
  ];
}

function renderReferenceFamily(reference: ReferenceAsset & { action: string }): string[] {
  return [
    `### ${reference.familyId} - ${reference.familyName}`,
    "",
    bullet("family_id", reference.familyId),
    bullet("family_name", reference.familyName),
    bullet("module", reference.module),
    bullet("intent", reference.intent),
    bullet("business_description", reference.businessDescription),
    bullet("core_tables", reference.coreTables),
    bullet("core_joins", reference.coreJoins),
    bullet("common_params", reference.commonParams),
    bullet("representative_dataset_id", reference.representativeDatasetId),
    "",
    "representative_sql preview",
    "",
    "```sql",
    preview(reference.representativeSql),
    "```",
    "",
    bullet("risk_flags", reference.riskFlags),
    "",
  ];
}

function renderMetricDraft(metric: MetricAsset & { action: string }): string[] {
  return [
    `### ${metric.familyId} - ${metric.metricCode}`,
    "",
    bullet("family_id", metric.familyId),
    bullet("metric_code", metric.metricCode),
    bullet("metric_name", metric.metricName),
    bullet("module", metric.module),
    bullet("business_description", metric.businessDescription),
    bullet("calculation_summary", metric.calculationSummary),
    bullet("core_tables", metric.coreTables),
    bullet("params", metric.params),
    "",
    "representative_sql preview",
    "",
    "```sql",
    preview(metric.representativeSql),
    "```",
    "",
    bullet("notes", metric.notes),
    "",
  ];
}

function bullet(label: string, value: unknown): string {
  return `- ${label}: ${typeof value === "string" || typeof value === "number" ? value : JSON.stringify(value)}`;
}

function preview(text: string): string {
  return text.length > 1000 ? `${text.slice(0, 1000)}...` : text;
}

function buildReferenceAsset(family: BusinessFamily) {
  const meta = REFERENCE_META[family.familyId];
  if (!meta) throw new Error(`Unsupported reference family: ${family.familyId}`);
  return {
    familyId: family.familyId,
    ...meta,
    coreTables: family.coreTables,
    coreJoins: family.coreJoins,
    commonParams: family.params,
    representativeDatasetId: family.representativeDatasetId,
    representativeSql: family.representativeSql,
    sampleDatasetIds: family.sampleDatasetIds,
    reportNames: family.reportNames,
    datasetNames: family.datasetNames,
    riskFlags: riskFlags(family),
  };
}

function buildMetricAsset(family: BusinessFamily) {
  const meta = METRIC_META[family.familyId];
  if (!meta) throw new Error(`Unsupported metric family: ${family.familyId}`);
  return {
    familyId: family.familyId,
    ...meta,
    coreTables: family.coreTables,
    coreJoins: family.coreJoins,
    params: family.params,
    representativeSql: family.representativeSql,
    sourceReportNames: family.reportNames,
    sourceDatasetIds: family.sampleDatasetIds,
  };
}

function paramMap(params: string[]) {
  return Object.fromEntries(params.map((name) => [name, { required: false }]));
}

function riskFlags(family: BusinessFamily): string[] {
  const flags: string[] = [];
  if ((family.hasFanruanMacroCount ?? 0) > 0) flags.push("finereport_macro_in_source");
  if ((family.hasNonSelectRiskCount ?? 0) > 0) flags.push("non_select_risk_in_source");
  if ((family.hasHardcodedCompanyCount ?? 0) > 0) flags.push("hardcoded_company_in_source");
  return flags;
}

function skip(report: SqlFamilyAssetPromotionReport, familyId: string, reason: string): void {
  report.skippedFamilies.push({ familyId, reason });
}

async function readJson<T>(filePath: string, label: string): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error(`Missing ${label} file: ${filePath}`);
    throw new Error(`Invalid ${label} file: ${filePath}`);
  }
}
