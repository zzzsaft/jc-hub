INSERT INTO "erp_agent"."business_metric_catalog" (
  "metric_code", "metric_name", "module", "family_id", "business_description",
  "calculation_summary", "core_tables", "core_joins", "params", "definition_json",
  "source_report_names", "source_dataset_ids", "status", "notes", "updated_at"
)
VALUES
(
  'order_amount', '销售订单金额', 'finance', 'atomic_order_amount',
  '按销售订单口径统计订单金额，可按客户、订单、产品、事业部展开。',
  'SUM(OrderHed.DocOrderAmt)，过滤打开订单。',
  '["Erp.OrderHed"]'::jsonb, '[]'::jsonb, '[]'::jsonb,
  $json${
    "kind": "atomic_metric",
    "metricCode": "order_amount",
    "grain": "order",
    "dimensions": ["customer", "order", "product", "division"],
    "dimensionExpressions": {
      "customer": "OrderHed.CustNum",
      "order": "OrderHed.OrderNum",
      "product": "OrderHed.ShortChar01",
      "division": "OrderHed.ShortChar02"
    },
    "keyExpressions": { "Company": "OrderHed.Company" },
    "timeField": "OrderHed.OrderDate",
    "amountExpression": "OrderHed.DocOrderAmt",
    "aggregation": "SUM",
    "statusFilters": ["OrderHed.OpenOrder = 1"],
    "requiredTables": ["Erp.OrderHed"],
    "joinKeys": ["Company"],
    "mode": "strict",
    "taxRefundPolicy": "按销售订单 DocOrderAmt 原币金额，税退款以 ERP 订单字段为准。"
  }$json$::jsonb,
  '[]'::jsonb, '[]'::jsonb, 'approved',
  'Approved atomic metric for scenario composer v1.', CURRENT_TIMESTAMP
),
(
  'invoice_revenue', '发票收入', 'finance', 'atomic_invoice_revenue',
  '按发票口径统计收入，可按客户、订单、产品展开。',
  'SUM(InvcHead.DocInvoiceAmt)，过滤已过账发票。',
  '["Erp.InvcHead"]'::jsonb, '[]'::jsonb, '[]'::jsonb,
  $json${
    "kind": "atomic_metric",
    "metricCode": "invoice_revenue",
    "grain": "invoice",
    "dimensions": ["customer", "order", "product"],
    "dimensionExpressions": {
      "customer": "InvcHead.CustNum",
      "order": "InvcHead.OrderNum",
      "product": "InvcHead.ShortChar01"
    },
    "keyExpressions": { "Company": "InvcHead.Company" },
    "timeField": "InvcHead.InvoiceDate",
    "amountExpression": "InvcHead.DocInvoiceAmt",
    "aggregation": "SUM",
    "statusFilters": ["InvcHead.Posted = 1"],
    "requiredTables": ["Erp.InvcHead"],
    "joinKeys": ["Company"],
    "mode": "strict",
    "taxRefundPolicy": "按已过账发票 DocInvoiceAmt 原币金额。"
  }$json$::jsonb,
  '[]'::jsonb, '[]'::jsonb, 'approved',
  'Approved atomic metric for scenario composer v1.', CURRENT_TIMESTAMP
),
(
  'gross_margin_amount', '毛利金额', 'finance', 'atomic_gross_margin_amount',
  '按订单金额减订单总成本统计毛利金额。',
  'SUM(OrderHed.DocOrderAmt - OrderHed.DocTotalCost)。',
  '["Erp.OrderHed"]'::jsonb, '[]'::jsonb, '[]'::jsonb,
  $json${
    "kind": "atomic_metric",
    "metricCode": "gross_margin_amount",
    "grain": "order",
    "dimensions": ["customer", "order", "product", "division"],
    "dimensionExpressions": {
      "customer": "OrderHed.CustNum",
      "order": "OrderHed.OrderNum",
      "product": "OrderHed.ShortChar01",
      "division": "OrderHed.ShortChar02"
    },
    "keyExpressions": { "Company": "OrderHed.Company" },
    "timeField": "OrderHed.OrderDate",
    "amountExpression": "OrderHed.DocOrderAmt - OrderHed.DocTotalCost",
    "aggregation": "SUM",
    "statusFilters": ["OrderHed.OpenOrder = 1"],
    "requiredTables": ["Erp.OrderHed"],
    "joinKeys": ["Company"],
    "mode": "strict",
    "taxRefundPolicy": "按订单金额减订单成本，税退款以 ERP 订单字段为准。"
  }$json$::jsonb,
  '[]'::jsonb, '[]'::jsonb, 'approved',
  'Approved atomic metric for scenario composer v1.', CURRENT_TIMESTAMP
),
(
  'gross_margin_rate', '毛利率', 'finance', 'atomic_gross_margin_rate',
  '按订单毛利除以订单金额统计毛利率。',
  'SUM(OrderHed.DocOrderAmt - OrderHed.DocTotalCost) / NULLIF(SUM(OrderHed.DocOrderAmt), 0)。',
  '["Erp.OrderHed"]'::jsonb, '[]'::jsonb, '[]'::jsonb,
  $json${
    "kind": "atomic_metric",
    "metricCode": "gross_margin_rate",
    "grain": "order",
    "dimensions": ["customer", "order", "product", "division"],
    "dimensionExpressions": {
      "customer": "OrderHed.CustNum",
      "order": "OrderHed.OrderNum",
      "product": "OrderHed.ShortChar01",
      "division": "OrderHed.ShortChar02"
    },
    "keyExpressions": { "Company": "OrderHed.Company" },
    "timeField": "OrderHed.OrderDate",
    "amountExpression": "SUM(OrderHed.DocOrderAmt - OrderHed.DocTotalCost) / NULLIF(SUM(OrderHed.DocOrderAmt), 0)",
    "aggregation": "AVG",
    "statusFilters": ["OrderHed.OpenOrder = 1"],
    "requiredTables": ["Erp.OrderHed"],
    "joinKeys": ["Company"],
    "mode": "strict",
    "taxRefundPolicy": "按订单金额和订单成本计算，税退款以 ERP 订单字段为准。"
  }$json$::jsonb,
  '[]'::jsonb, '[]'::jsonb, 'approved',
  'Approved atomic metric for scenario composer v1.', CURRENT_TIMESTAMP
),
(
  'cost_component_amount', '成本构成金额', 'finance', 'atomic_cost_component_amount',
  '按订单总成本统计成本金额，v1 用作成本占比/成本偏高分析的 approved 原子口径。',
  'SUM(OrderHed.DocTotalCost)。',
  '["Erp.OrderHed"]'::jsonb, '[]'::jsonb, '[]'::jsonb,
  $json${
    "kind": "atomic_metric",
    "metricCode": "cost_component_amount",
    "grain": "order",
    "dimensions": ["customer", "order", "product", "division"],
    "dimensionExpressions": {
      "customer": "OrderHed.CustNum",
      "order": "OrderHed.OrderNum",
      "product": "OrderHed.ShortChar01",
      "division": "OrderHed.ShortChar02"
    },
    "keyExpressions": { "Company": "OrderHed.Company" },
    "timeField": "OrderHed.OrderDate",
    "amountExpression": "OrderHed.DocTotalCost",
    "aggregation": "SUM",
    "statusFilters": ["OrderHed.OpenOrder = 1"],
    "requiredTables": ["Erp.OrderHed"],
    "joinKeys": ["Company"],
    "mode": "strict",
    "taxRefundPolicy": "按订单总成本字段统计，不拆物料/人工/制造明细。"
  }$json$::jsonb,
  '[]'::jsonb, '[]'::jsonb, 'approved',
  'Approved atomic metric for scenario composer v1.', CURRENT_TIMESTAMP
),
(
  'material_cost_amount', '材料成本金额', 'finance', 'atomic_material_cost_amount',
  '按生产入库事务统计材料成本金额，可按客户、订单、产品、事业部展开。',
  'SUM(PartTran.MtlUnitCost * ABS(PartTran.TranQty))，仅批准 MFG-STK/MFG-CUS 成本事务。',
  '["Erp.PartTran", "Erp.JobProd", "Erp.OrderDtl", "Erp.OrderHed", "Erp.Customer"]'::jsonb,
  '["PartTran.JobNum = JobProd.JobNum", "JobProd.OrderNum = OrderDtl.OrderNum", "OrderDtl.OrderNum = OrderHed.OrderNum", "OrderHed.CustNum = Customer.CustNum"]'::jsonb,
  '[]'::jsonb,
  $json${
    "kind": "atomic_metric",
    "metricCode": "material_cost_amount",
    "grain": "production_cost_transaction",
    "dimensions": ["customer", "order", "product", "division"],
    "dimensionExpressions": {
      "customer": "OrderHed.CustNum",
      "order": "OrderDtl.OrderNum",
      "product": "PartTran.PartNum",
      "division": "OrderHed.ShortChar02"
    },
    "keyExpressions": { "Company": "PartTran.Company" },
    "timeField": "PartTran.TranDate",
    "amountExpression": "PartTran.MtlUnitCost * ABS(PartTran.TranQty)",
    "aggregation": "SUM",
    "statusFilters": ["PartTran.TranType IN ('MFG-STK', 'MFG-CUS')", "PartTran.TranQty <> 0"],
    "requiredTables": ["Erp.PartTran"],
    "joinSql": [
      "JOIN Erp.JobProd JobProd ON JobProd.Company = PartTran.Company AND JobProd.JobNum = PartTran.JobNum",
      "JOIN Erp.OrderDtl OrderDtl ON OrderDtl.Company = JobProd.Company AND OrderDtl.OrderNum = JobProd.OrderNum AND OrderDtl.OrderLine = JobProd.OrderLine",
      "JOIN Erp.OrderHed OrderHed ON OrderHed.Company = OrderDtl.Company AND OrderHed.OrderNum = OrderDtl.OrderNum",
      "LEFT JOIN Erp.Customer Customer ON Customer.Company = OrderHed.Company AND Customer.CustNum = OrderHed.CustNum"
    ],
    "joinKeys": ["Company"],
    "mode": "strict",
    "taxRefundPolicy": "生产成本口径；不含退款/RMA/发票确认/回款。"
  }$json$::jsonb,
  '[]'::jsonb, '[]'::jsonb, 'approved',
  'Approved atomic cost component metric. Amount = UnitCost * ABS(TranQty).', CURRENT_TIMESTAMP
),
(
  'labor_cost_amount', '人工成本金额', 'finance', 'atomic_labor_cost_amount',
  '按生产入库事务统计人工成本金额，可按客户、订单、产品、事业部展开。',
  'SUM(PartTran.LbrUnitCost * ABS(PartTran.TranQty))，仅批准 MFG-STK/MFG-CUS 成本事务。',
  '["Erp.PartTran", "Erp.JobProd", "Erp.OrderDtl", "Erp.OrderHed", "Erp.Customer"]'::jsonb,
  '["PartTran.JobNum = JobProd.JobNum", "JobProd.OrderNum = OrderDtl.OrderNum", "OrderDtl.OrderNum = OrderHed.OrderNum", "OrderHed.CustNum = Customer.CustNum"]'::jsonb,
  '[]'::jsonb,
  $json${
    "kind": "atomic_metric",
    "metricCode": "labor_cost_amount",
    "grain": "production_cost_transaction",
    "dimensions": ["customer", "order", "product", "division"],
    "dimensionExpressions": {
      "customer": "OrderHed.CustNum",
      "order": "OrderDtl.OrderNum",
      "product": "PartTran.PartNum",
      "division": "OrderHed.ShortChar02"
    },
    "keyExpressions": { "Company": "PartTran.Company" },
    "timeField": "PartTran.TranDate",
    "amountExpression": "PartTran.LbrUnitCost * ABS(PartTran.TranQty)",
    "aggregation": "SUM",
    "statusFilters": ["PartTran.TranType IN ('MFG-STK', 'MFG-CUS')", "PartTran.TranQty <> 0"],
    "requiredTables": ["Erp.PartTran"],
    "joinSql": [
      "JOIN Erp.JobProd JobProd ON JobProd.Company = PartTran.Company AND JobProd.JobNum = PartTran.JobNum",
      "JOIN Erp.OrderDtl OrderDtl ON OrderDtl.Company = JobProd.Company AND OrderDtl.OrderNum = JobProd.OrderNum AND OrderDtl.OrderLine = JobProd.OrderLine",
      "JOIN Erp.OrderHed OrderHed ON OrderHed.Company = OrderDtl.Company AND OrderHed.OrderNum = OrderDtl.OrderNum",
      "LEFT JOIN Erp.Customer Customer ON Customer.Company = OrderHed.Company AND Customer.CustNum = OrderHed.CustNum"
    ],
    "joinKeys": ["Company"],
    "mode": "strict",
    "taxRefundPolicy": "生产成本口径；不含退款/RMA/发票确认/回款。"
  }$json$::jsonb,
  '[]'::jsonb, '[]'::jsonb, 'approved',
  'Approved atomic cost component metric. Amount = UnitCost * ABS(TranQty).', CURRENT_TIMESTAMP
),
(
  'burden_cost_amount', '制造成本金额', 'finance', 'atomic_burden_cost_amount',
  '按生产入库事务统计制造费用/制造成本金额，可按客户、订单、产品、事业部展开。',
  'SUM(PartTran.BurUnitCost * ABS(PartTran.TranQty))，仅批准 MFG-STK/MFG-CUS 成本事务。',
  '["Erp.PartTran", "Erp.JobProd", "Erp.OrderDtl", "Erp.OrderHed", "Erp.Customer"]'::jsonb,
  '["PartTran.JobNum = JobProd.JobNum", "JobProd.OrderNum = OrderDtl.OrderNum", "OrderDtl.OrderNum = OrderHed.OrderNum", "OrderHed.CustNum = Customer.CustNum"]'::jsonb,
  '[]'::jsonb,
  $json${
    "kind": "atomic_metric",
    "metricCode": "burden_cost_amount",
    "grain": "production_cost_transaction",
    "dimensions": ["customer", "order", "product", "division"],
    "dimensionExpressions": {
      "customer": "OrderHed.CustNum",
      "order": "OrderDtl.OrderNum",
      "product": "PartTran.PartNum",
      "division": "OrderHed.ShortChar02"
    },
    "keyExpressions": { "Company": "PartTran.Company" },
    "timeField": "PartTran.TranDate",
    "amountExpression": "PartTran.BurUnitCost * ABS(PartTran.TranQty)",
    "aggregation": "SUM",
    "statusFilters": ["PartTran.TranType IN ('MFG-STK', 'MFG-CUS')", "PartTran.TranQty <> 0"],
    "requiredTables": ["Erp.PartTran"],
    "joinSql": [
      "JOIN Erp.JobProd JobProd ON JobProd.Company = PartTran.Company AND JobProd.JobNum = PartTran.JobNum",
      "JOIN Erp.OrderDtl OrderDtl ON OrderDtl.Company = JobProd.Company AND OrderDtl.OrderNum = JobProd.OrderNum AND OrderDtl.OrderLine = JobProd.OrderLine",
      "JOIN Erp.OrderHed OrderHed ON OrderHed.Company = OrderDtl.Company AND OrderHed.OrderNum = OrderDtl.OrderNum",
      "LEFT JOIN Erp.Customer Customer ON Customer.Company = OrderHed.Company AND Customer.CustNum = OrderHed.CustNum"
    ],
    "joinKeys": ["Company"],
    "mode": "strict",
    "taxRefundPolicy": "生产成本口径；不含退款/RMA/发票确认/回款。"
  }$json$::jsonb,
  '[]'::jsonb, '[]'::jsonb, 'approved',
  'Approved atomic cost component metric. Amount = UnitCost * ABS(TranQty).', CURRENT_TIMESTAMP
),
(
  'subcontract_cost_amount', '外协成本金额', 'finance', 'atomic_subcontract_cost_amount',
  '按生产入库事务统计外协成本金额，可按客户、订单、产品、事业部展开。',
  'SUM(PartTran.SubUnitCost * ABS(PartTran.TranQty))，仅批准 MFG-STK/MFG-CUS 成本事务。',
  '["Erp.PartTran", "Erp.JobProd", "Erp.OrderDtl", "Erp.OrderHed", "Erp.Customer"]'::jsonb,
  '["PartTran.JobNum = JobProd.JobNum", "JobProd.OrderNum = OrderDtl.OrderNum", "OrderDtl.OrderNum = OrderHed.OrderNum", "OrderHed.CustNum = Customer.CustNum"]'::jsonb,
  '[]'::jsonb,
  $json${
    "kind": "atomic_metric",
    "metricCode": "subcontract_cost_amount",
    "grain": "production_cost_transaction",
    "dimensions": ["customer", "order", "product", "division"],
    "dimensionExpressions": {
      "customer": "OrderHed.CustNum",
      "order": "OrderDtl.OrderNum",
      "product": "PartTran.PartNum",
      "division": "OrderHed.ShortChar02"
    },
    "keyExpressions": { "Company": "PartTran.Company" },
    "timeField": "PartTran.TranDate",
    "amountExpression": "PartTran.SubUnitCost * ABS(PartTran.TranQty)",
    "aggregation": "SUM",
    "statusFilters": ["PartTran.TranType IN ('MFG-STK', 'MFG-CUS')", "PartTran.TranQty <> 0"],
    "requiredTables": ["Erp.PartTran"],
    "joinSql": [
      "JOIN Erp.JobProd JobProd ON JobProd.Company = PartTran.Company AND JobProd.JobNum = PartTran.JobNum",
      "JOIN Erp.OrderDtl OrderDtl ON OrderDtl.Company = JobProd.Company AND OrderDtl.OrderNum = JobProd.OrderNum AND OrderDtl.OrderLine = JobProd.OrderLine",
      "JOIN Erp.OrderHed OrderHed ON OrderHed.Company = OrderDtl.Company AND OrderHed.OrderNum = OrderDtl.OrderNum",
      "LEFT JOIN Erp.Customer Customer ON Customer.Company = OrderHed.Company AND Customer.CustNum = OrderHed.CustNum"
    ],
    "joinKeys": ["Company"],
    "mode": "strict",
    "taxRefundPolicy": "生产成本口径；不含退款/RMA/发票确认/回款。"
  }$json$::jsonb,
  '[]'::jsonb, '[]'::jsonb, 'approved',
  'Approved atomic cost component metric. Amount = UnitCost * ABS(TranQty).', CURRENT_TIMESTAMP
),
(
  'open_order_amount', '未交付订单金额', 'finance', 'atomic_open_order_amount',
  '按打开订单统计未交付金额。',
  'SUM(OrderHed.DocOrderAmt)，过滤 OpenOrder = 1。',
  '["Erp.OrderHed"]'::jsonb, '[]'::jsonb, '[]'::jsonb,
  $json${
    "kind": "atomic_metric",
    "metricCode": "open_order_amount",
    "grain": "order",
    "dimensions": ["customer", "order", "product", "division"],
    "dimensionExpressions": {
      "customer": "OrderHed.CustNum",
      "order": "OrderHed.OrderNum",
      "product": "OrderHed.ShortChar01",
      "division": "OrderHed.ShortChar02"
    },
    "keyExpressions": { "Company": "OrderHed.Company" },
    "timeField": "OrderHed.OrderDate",
    "amountExpression": "OrderHed.DocOrderAmt",
    "aggregation": "SUM",
    "statusFilters": ["OrderHed.OpenOrder = 1"],
    "requiredTables": ["Erp.OrderHed"],
    "joinKeys": ["Company"],
    "mode": "strict",
    "taxRefundPolicy": "按打开订单 DocOrderAmt 原币金额。"
  }$json$::jsonb,
  '[]'::jsonb, '[]'::jsonb, 'approved',
  'Approved atomic metric for scenario composer v1.', CURRENT_TIMESTAMP
),
(
  'open_shipping_qty', '待发货数量', 'finance', 'atomic_open_shipping_qty',
  '按打开销售 release 统计待发、未发货、欠发、未交付数量。',
  'SUM(OrderRel.OurReqQty)，过滤 OpenRelease = 1 且 OurReqQty > 0。',
  '["Erp.OrderRel", "Erp.OrderDtl", "Erp.OrderHed", "Erp.Customer"]'::jsonb,
  '["OrderRel -> OrderDtl -> OrderHed -> Customer"]'::jsonb, '[]'::jsonb,
  $json${
    "kind": "atomic_metric",
    "metricCode": "open_shipping_qty",
    "grain": "sales_order_release",
    "dimensions": ["customer", "order", "product", "warehouse", "division"],
    "dimensionExpressions": {
      "customer": "OrderHed.CustNum",
      "order": "OrderRel.OrderNum",
      "product": "OrderDtl.PartNum",
      "warehouse": "OrderRel.WarehouseCode",
      "division": "OrderHed.ShortChar02"
    },
    "keyExpressions": { "Company": "OrderRel.Company" },
    "timeField": "OrderRel.ReqDate",
    "amountExpression": "OrderRel.OurReqQty",
    "aggregation": "SUM",
    "statusFilters": ["OrderRel.OpenRelease = 1", "OrderRel.OurReqQty > 0"],
    "overdueFilters": ["OrderRel.ReqDate < CAST(GETDATE() AS date)"],
    "requiredTables": ["Erp.OrderRel"],
    "joinSql": [
      "JOIN Erp.OrderDtl OrderDtl ON OrderDtl.Company = OrderRel.Company AND OrderDtl.OrderNum = OrderRel.OrderNum AND OrderDtl.OrderLine = OrderRel.OrderLine",
      "JOIN Erp.OrderHed OrderHed ON OrderHed.Company = OrderRel.Company AND OrderHed.OrderNum = OrderRel.OrderNum",
      "LEFT JOIN Erp.Customer Customer ON Customer.Company = OrderHed.Company AND Customer.CustNum = OrderHed.CustNum"
    ],
    "joinKeys": ["Company"],
    "mode": "strict",
    "taxRefundPolicy": "数量指标；仅按打开 release 的 OurReqQty 统计待发数量。"
  }$json$::jsonb,
  '[]'::jsonb, '[]'::jsonb, 'approved',
  'Approved atomic open shipping quantity metric using family_037 scope.', CURRENT_TIMESTAMP
),
(
  'open_shipping_amount', '待发货金额', 'finance', 'atomic_open_shipping_amount',
  '按打开销售 release 待发数量折算待发、未发货、欠发、未交付金额。',
  'SUM(OrderDtl.DocExtPriceDtl * OrderRel.OurReqQty / NULLIF(OrderDtl.OrderQty, 0))，过滤 OpenRelease = 1 且 OurReqQty > 0。',
  '["Erp.OrderRel", "Erp.OrderDtl", "Erp.OrderHed", "Erp.Customer"]'::jsonb,
  '["OrderRel -> OrderDtl -> OrderHed -> Customer"]'::jsonb, '[]'::jsonb,
  $json${
    "kind": "atomic_metric",
    "metricCode": "open_shipping_amount",
    "grain": "sales_order_release",
    "dimensions": ["customer", "order", "product", "warehouse", "division"],
    "dimensionExpressions": {
      "customer": "OrderHed.CustNum",
      "order": "OrderRel.OrderNum",
      "product": "OrderDtl.PartNum",
      "warehouse": "OrderRel.WarehouseCode",
      "division": "OrderHed.ShortChar02"
    },
    "keyExpressions": { "Company": "OrderRel.Company" },
    "timeField": "OrderRel.ReqDate",
    "amountExpression": "OrderDtl.DocExtPriceDtl * OrderRel.OurReqQty / NULLIF(OrderDtl.OrderQty, 0)",
    "aggregation": "SUM",
    "statusFilters": ["OrderRel.OpenRelease = 1", "OrderRel.OurReqQty > 0"],
    "overdueFilters": ["OrderRel.ReqDate < CAST(GETDATE() AS date)"],
    "requiredTables": ["Erp.OrderRel"],
    "joinSql": [
      "JOIN Erp.OrderDtl OrderDtl ON OrderDtl.Company = OrderRel.Company AND OrderDtl.OrderNum = OrderRel.OrderNum AND OrderDtl.OrderLine = OrderRel.OrderLine",
      "JOIN Erp.OrderHed OrderHed ON OrderHed.Company = OrderRel.Company AND OrderHed.OrderNum = OrderRel.OrderNum",
      "LEFT JOIN Erp.Customer Customer ON Customer.Company = OrderHed.Company AND Customer.CustNum = OrderHed.CustNum"
    ],
    "joinKeys": ["Company"],
    "mode": "strict",
    "taxRefundPolicy": "按订单行 DocExtPriceDtl 依据待发数量 OurReqQty / OrderQty 折算原币金额。"
  }$json$::jsonb,
  '[]'::jsonb, '[]'::jsonb, 'approved',
  'Approved atomic open shipping amount metric using family_037 scope.', CURRENT_TIMESTAMP
),
(
  'inventory_on_hand_qty', '库存现存量', 'inventory', 'atomic_inventory_on_hand_qty',
  '按产品和仓库统计当前现存库存数量。',
  'SUM(PartWhse.OnHandQty)，仅统计现存量大于 0 的产品仓库存量。',
  '["Erp.PartWhse"]'::jsonb, '[]'::jsonb, '[]'::jsonb,
  $json${
    "kind": "atomic_metric",
    "metricCode": "inventory_on_hand_qty",
    "grain": "warehouse_inventory",
    "dimensions": ["product", "warehouse"],
    "dimensionExpressions": {
      "product": "PartWhse.PartNum",
      "warehouse": "PartWhse.WarehouseCode"
    },
    "keyExpressions": { "Company": "PartWhse.Company" },
    "amountExpression": "PartWhse.OnHandQty",
    "aggregation": "SUM",
    "statusFilters": ["PartWhse.OnHandQty > 0"],
    "requiredTables": ["Erp.PartWhse"],
    "joinKeys": ["Company"],
    "mode": "strict",
    "taxRefundPolicy": "库存运营数量口径；不是金额、成本、发票、回款或结算口径。"
  }$json$::jsonb,
  '[]'::jsonb, '[]'::jsonb, 'approved',
  'Approved atomic inventory on-hand quantity metric for operational analysis.', CURRENT_TIMESTAMP
),
(
  'collection_delay_days', '回款逾期天数', 'finance', 'atomic_collection_delay_days',
  '按已过账、未关闭、仍有未收余额且已逾期的发票统计最大逾期天数，可按客户、订单展开。',
  'MAX(DATEDIFF(day, InvcHead.DueDate, CAST(GETDATE() AS date)))，仅统计 DueDate 已过且 DocInvoiceBal > 0 的 open posted 发票。',
  '["Erp.InvcHead"]'::jsonb, '[]'::jsonb, '[]'::jsonb,
  $json${
    "kind": "atomic_metric",
    "metricCode": "collection_delay_days",
    "grain": "invoice",
    "dimensions": ["customer", "order"],
    "dimensionExpressions": {
      "customer": "InvcHead.CustNum",
      "order": "InvcHead.OrderNum"
    },
    "keyExpressions": { "Company": "InvcHead.Company" },
    "timeField": "InvcHead.DueDate",
    "amountExpression": "DATEDIFF(day, InvcHead.DueDate, CAST(GETDATE() AS date))",
    "aggregation": "MAX",
    "statusFilters": [
      "InvcHead.Posted = 1",
      "InvcHead.OpenInvoice = 1",
      "InvcHead.DocInvoiceBal > 0",
      "InvcHead.DueDate < CAST(GETDATE() AS date)"
    ],
    "requiredTables": ["Erp.InvcHead"],
    "joinKeys": ["Company"],
    "mode": "strict",
    "taxRefundPolicy": "发票未收余额运营口径，不含 CashDtl 实收明细、退款、冲销或坏账核销拆分。"
  }$json$::jsonb,
  '[]'::jsonb, '[]'::jsonb, 'approved',
  'Approved atomic overdue collection metric using invoice balance scope.', CURRENT_TIMESTAMP
),
(
  'collection_overdue_amount', '逾期回款金额', 'finance', 'atomic_collection_overdue_amount',
  '按已过账、未关闭、仍有未收余额且已逾期的发票统计逾期未收金额，可按客户、订单展开。',
  'SUM(InvcHead.DocInvoiceBal)，仅统计 DueDate 已过且 DocInvoiceBal > 0 的 open posted 发票。',
  '["Erp.InvcHead"]'::jsonb, '[]'::jsonb, '[]'::jsonb,
  $json${
    "kind": "atomic_metric",
    "metricCode": "collection_overdue_amount",
    "grain": "invoice",
    "dimensions": ["customer", "order"],
    "dimensionExpressions": {
      "customer": "InvcHead.CustNum",
      "order": "InvcHead.OrderNum"
    },
    "keyExpressions": { "Company": "InvcHead.Company" },
    "timeField": "InvcHead.DueDate",
    "amountExpression": "InvcHead.DocInvoiceBal",
    "aggregation": "SUM",
    "statusFilters": [
      "InvcHead.Posted = 1",
      "InvcHead.OpenInvoice = 1",
      "InvcHead.DocInvoiceBal > 0",
      "InvcHead.DueDate < CAST(GETDATE() AS date)"
    ],
    "requiredTables": ["Erp.InvcHead"],
    "joinKeys": ["Company"],
    "mode": "strict",
    "taxRefundPolicy": "发票未收余额运营口径，不含 CashDtl 实收明细、退款、冲销或坏账核销拆分。"
  }$json$::jsonb,
  '[]'::jsonb, '[]'::jsonb, 'approved',
  'Approved atomic overdue collection metric using invoice balance scope.', CURRENT_TIMESTAMP
),
(
  'shipped_amount', '发货金额', 'finance', 'atomic_shipped_amount',
  '按客户发货明细统计已发货金额，可按客户、订单、产品、事业部展开。',
  'SUM(OrderDtl.DocExtPriceDtl * (COALESCE(ShipDtl.OurInventoryShipQty, 0) + COALESCE(ShipDtl.OurJobShipQty, 0)) / NULLIF(OrderDtl.OrderQty, 0))，按 ShipHead.ShipDate 取发货日期。',
  '["Erp.ShipDtl", "Erp.ShipHead", "Erp.OrderDtl", "Erp.OrderHed", "Erp.Customer"]'::jsonb,
  '["ShipDtl -> ShipHead", "ShipDtl -> OrderDtl -> OrderHed -> Customer"]'::jsonb, '[]'::jsonb,
  $json${
    "kind": "atomic_metric",
    "metricCode": "shipped_amount",
    "grain": "shipment",
    "dimensions": ["customer", "order", "product", "division"],
    "dimensionExpressions": {
      "customer": "OrderHed.CustNum",
      "order": "ShipDtl.OrderNum",
      "product": "ShipDtl.PartNum",
      "division": "OrderHed.ShortChar02"
    },
    "keyExpressions": { "Company": "ShipDtl.Company" },
    "timeField": "ShipHead.ShipDate",
    "amountExpression": "OrderDtl.DocExtPriceDtl * (COALESCE(ShipDtl.OurInventoryShipQty, 0) + COALESCE(ShipDtl.OurJobShipQty, 0)) / NULLIF(OrderDtl.OrderQty, 0)",
    "aggregation": "SUM",
    "statusFilters": ["ShipDtl.OrderNum <> 0", "(COALESCE(ShipDtl.OurInventoryShipQty, 0) + COALESCE(ShipDtl.OurJobShipQty, 0)) <> 0"],
    "requiredTables": ["Erp.ShipDtl"],
    "joinSql": [
      "JOIN Erp.ShipHead ShipHead ON ShipHead.Company = ShipDtl.Company AND ShipHead.PackNum = ShipDtl.PackNum",
      "JOIN Erp.OrderDtl OrderDtl ON OrderDtl.Company = ShipDtl.Company AND OrderDtl.OrderNum = ShipDtl.OrderNum AND OrderDtl.OrderLine = ShipDtl.OrderLine",
      "JOIN Erp.OrderHed OrderHed ON OrderHed.Company = OrderDtl.Company AND OrderHed.OrderNum = OrderDtl.OrderNum",
      "LEFT JOIN Erp.Customer Customer ON Customer.Company = OrderHed.Company AND Customer.CustNum = OrderHed.CustNum"
    ],
    "joinKeys": ["Company"],
    "mode": "strict",
    "taxRefundPolicy": "发货运营金额，按发货数量折算订单行金额；不是发票、收入、回款、结算或退款口径。"
  }$json$::jsonb,
  '[]'::jsonb, '[]'::jsonb, 'approved',
  'Approved atomic shipped amount metric for customer shipment analysis.', CURRENT_TIMESTAMP
),
(
  'open_job_margin_cost_risk', '未完工工单风险计数', 'finance', 'atomic_open_job_margin_cost_risk',
  '按关联客户订单的未关闭未完成工单统计运营风险数量，可按客户、订单、产品展开。',
  'COUNT(DISTINCT JobHead.JobNum)，过滤 JobClosed = 0 且 JobComplete = 0。',
  '["Erp.JobHead", "Erp.JobProd", "Erp.OrderDtl", "Erp.OrderHed", "Erp.Customer"]'::jsonb,
  '["JobHead -> JobProd -> OrderDtl -> OrderHed -> Customer"]'::jsonb, '[]'::jsonb,
  $json${
    "kind": "atomic_metric",
    "metricCode": "open_job_margin_cost_risk",
    "grain": "open_job",
    "dimensions": ["customer", "order", "product", "division"],
    "dimensionExpressions": {
      "customer": "OrderHed.CustNum",
      "order": "JobProd.OrderNum",
      "product": "OrderDtl.PartNum",
      "division": "OrderHed.ShortChar02"
    },
    "keyExpressions": { "Company": "JobHead.Company" },
    "timeField": "JobHead.CreateDate",
    "amountExpression": "DISTINCT JobHead.JobNum",
    "aggregation": "COUNT",
    "statusFilters": ["JobHead.JobClosed = 0", "JobHead.JobComplete = 0", "JobProd.OrderNum <> 0"],
    "requiredTables": ["Erp.JobHead"],
    "joinSql": [
      "JOIN Erp.JobProd JobProd ON JobProd.Company = JobHead.Company AND JobProd.JobNum = JobHead.JobNum",
      "JOIN Erp.OrderDtl OrderDtl ON OrderDtl.Company = JobProd.Company AND OrderDtl.OrderNum = JobProd.OrderNum AND OrderDtl.OrderLine = JobProd.OrderLine",
      "JOIN Erp.OrderHed OrderHed ON OrderHed.Company = OrderDtl.Company AND OrderHed.OrderNum = OrderDtl.OrderNum",
      "LEFT JOIN Erp.Customer Customer ON Customer.Company = OrderHed.Company AND Customer.CustNum = OrderHed.CustNum"
    ],
    "joinKeys": ["Company"],
    "mode": "strict",
    "taxRefundPolicy": "未完工工单运营风险计数；不是金额、收入、成本、发票、回款、结算或退款口径。"
  }$json$::jsonb,
  '[]'::jsonb, '[]'::jsonb, 'approved',
  'Approved atomic open job risk count metric for customer order risk analysis.', CURRENT_TIMESTAMP
),
(
  'purchase_amount', '采购金额', 'finance', 'atomic_purchase_amount',
  '按采购订单统计采购金额，可按产品/订单展开。',
  'SUM(PODetail.DocExtCost)，过滤打开采购订单。',
  '["Erp.POHeader", "Erp.PODetail"]'::jsonb, '["POHeader.PONum = PODetail.PONum"]'::jsonb, '[]'::jsonb,
  $json${
    "kind": "atomic_metric",
    "metricCode": "purchase_amount",
    "grain": "purchase_order",
    "dimensions": ["product", "order"],
    "dimensionExpressions": {
      "product": "PODetail.PartNum",
      "order": "POHeader.PONum"
    },
    "keyExpressions": { "Company": "POHeader.Company" },
    "timeField": "POHeader.OrderDate",
    "amountExpression": "PODetail.DocExtCost",
    "aggregation": "SUM",
    "statusFilters": ["POHeader.OpenOrder = 1"],
    "requiredTables": ["Erp.POHeader"],
    "joinSql": ["JOIN Erp.PODetail PODetail ON PODetail.Company = POHeader.Company AND PODetail.PONUM = POHeader.PONum"],
    "joinKeys": ["Company"],
    "mode": "strict",
    "taxRefundPolicy": "按采购订单明细 DocExtCost 原币金额。"
  }$json$::jsonb,
  '[]'::jsonb, '[]'::jsonb, 'approved',
  'Approved atomic metric for scenario composer v1.', CURRENT_TIMESTAMP
)
ON CONFLICT ("metric_code") DO UPDATE SET
  "metric_name" = EXCLUDED."metric_name",
  "module" = EXCLUDED."module",
  "family_id" = EXCLUDED."family_id",
  "business_description" = EXCLUDED."business_description",
  "calculation_summary" = EXCLUDED."calculation_summary",
  "core_tables" = EXCLUDED."core_tables",
  "core_joins" = EXCLUDED."core_joins",
  "params" = EXCLUDED."params",
  "definition_json" = EXCLUDED."definition_json",
  "status" = EXCLUDED."status",
  "notes" = EXCLUDED."notes",
  "updated_at" = CURRENT_TIMESTAMP;
