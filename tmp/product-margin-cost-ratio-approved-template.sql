WITH base AS (
  SELECT
    a.Company,
    a.PartNum,
    COALESCE(p.PartDescription, a.PartDescription) AS ProductDescription,
    c.Name AS CustomerName,
    d.OrderNum,
    oh.OpenOrder,
    a.TranDate,
    SUM(CAST(a.TranQty AS decimal(18, 4))) AS Qty,
    SUM(CAST((CASE WHEN d.DocUnitPrice < 0 THEN d.DocInUnitPrice + d.DocUnitPrice ELSE d.DocUnitPrice END) * a.TranQty AS decimal(18, 4))) AS SalesAmountUntaxed,
    SUM(CAST(a.ExtCost AS decimal(18, 4))) AS TotalCost,
    SUM(CAST(a.MtlUnitCost * a.TranQty AS decimal(18, 4))) AS MaterialCost,
    SUM(CAST(a.LbrUnitCost * a.TranQty AS decimal(18, 4))) AS LaborCost,
    SUM(CAST(a.BurUnitCost * a.TranQty AS decimal(18, 4))) AS BurdenCost,
    SUM(CAST(a.SubUnitCost * a.TranQty AS decimal(18, 4))) AS SubcontractCost
  FROM Erp.PartTran a
  INNER JOIN Erp.JobProd jp
    ON a.Company = jp.Company
    AND a.JobNum = jp.JobNum
  INNER JOIN Erp.OrderDtl d
    ON d.Company = jp.Company
    AND d.OrderNum = jp.OrderNum
    AND d.OrderLine = jp.OrderLine
  INNER JOIN Erp.OrderHed oh
    ON oh.Company = d.Company
    AND oh.OrderNum = d.OrderNum
  INNER JOIN Erp.Customer c
    ON c.Company = oh.Company
    AND c.CustNum = oh.CustNum
  LEFT JOIN Erp.Part p
    ON p.Company = a.Company
    AND p.PartNum = a.PartNum
  WHERE a.TranDate >= DATEFROMPARTS(YEAR(GETDATE()), 6, 1)
    AND a.TranDate < DATEADD(month, 1, DATEFROMPARTS(YEAR(GETDATE()), 6, 1))
    AND a.TranDate >= '20000101'
    AND a.TranDate < DATEADD(year, 1, CAST(GETDATE() AS date))
    AND a.TranType IN ('MFG-STK', 'MFG-CUS')
    AND a.TranQty > 0
    AND d.DocUnitPrice <> 0
  GROUP BY
    a.Company,
    a.PartNum,
    COALESCE(p.PartDescription, a.PartDescription),
    c.Name,
    d.OrderNum,
    oh.OpenOrder,
    a.TranDate
),
product_totals AS (
  SELECT
    Company,
    PartNum,
    ProductDescription,
    SUM(Qty) AS Qty,
    SUM(SalesAmountUntaxed) AS SalesAmountUntaxed,
    SUM(TotalCost) AS TotalCost,
    SUM(MaterialCost) AS MaterialCost,
    SUM(LaborCost) AS LaborCost,
    SUM(BurdenCost) AS BurdenCost,
    SUM(SubcontractCost) AS SubcontractCost,
    MAX(CAST(OpenOrder AS int)) AS HasOpenOrder
  FROM base
  GROUP BY Company, PartNum, ProductDescription
),
top_products AS (
  SELECT TOP 5
    Company,
    PartNum,
    ProductDescription,
    Qty,
    SalesAmountUntaxed,
    TotalCost,
    MaterialCost,
    LaborCost,
    BurdenCost,
    SubcontractCost,
    SalesAmountUntaxed - TotalCost AS GrossProfitAmount,
    CAST((SalesAmountUntaxed - TotalCost) * 100.0 / NULLIF(SalesAmountUntaxed, 0) AS decimal(18, 2)) AS GrossProfitRate,
    CAST(TotalCost * 100.0 / NULLIF(SalesAmountUntaxed, 0) AS decimal(18, 2)) AS CostRatio,
    HasOpenOrder
  FROM product_totals
  ORDER BY SalesAmountUntaxed DESC
),
customer_totals AS (
  SELECT
    b.Company,
    b.PartNum,
    b.CustomerName,
    SUM(b.SalesAmountUntaxed) AS CustomerSalesAmountUntaxed,
    SUM(b.SalesAmountUntaxed - b.TotalCost) AS CustomerGrossProfitAmount
  FROM base b
  INNER JOIN top_products tp
    ON tp.Company = b.Company
    AND tp.PartNum = b.PartNum
  GROUP BY b.Company, b.PartNum, b.CustomerName
)
SELECT TOP 100
  tp.Company,
  tp.PartNum AS [产品编号],
  tp.ProductDescription AS [产品描述],
  tp.SalesAmountUntaxed AS [未税销售额],
  tp.TotalCost AS [总成本],
  tp.GrossProfitAmount AS [毛利金额],
  tp.GrossProfitRate AS [毛利率],
  tp.CostRatio AS [成本占比],
  max_component.ComponentName AS [成本占比最大项],
  max_component.ComponentCost AS [成本占比最大项金额],
  ct.CustomerName AS [客户],
  ct.CustomerSalesAmountUntaxed AS [客户未税销售额],
  ct.CustomerGrossProfitAmount AS [客户毛利金额],
  N'PartTran.TranDate，默认当前年份6月' AS [时间字段],
  N'未税销售额=OrderDtl未税单价*PartTran入库数量；毛利金额=未税销售额-PartTran.ExtCost' AS [金额字段],
  CONCAT(N'TranType in MFG-STK/MFG-CUS; OpenOrder最大值=', tp.HasOpenOrder) AS [状态过滤],
  N'未税口径；未扣退款/RMA；不含发票确认和收款口径' AS [税退款口径]
FROM top_products tp
INNER JOIN customer_totals ct
  ON ct.Company = tp.Company
  AND ct.PartNum = tp.PartNum
CROSS APPLY (
  SELECT TOP 1
    component.ComponentName,
    component.ComponentCost
  FROM (VALUES
    (N'物料费', tp.MaterialCost),
    (N'人工费', tp.LaborCost),
    (N'制造费', tp.BurdenCost),
    (N'外协费', tp.SubcontractCost)
  ) AS component(ComponentName, ComponentCost)
  ORDER BY component.ComponentCost DESC
) max_component
ORDER BY
  tp.SalesAmountUntaxed DESC,
  ct.CustomerSalesAmountUntaxed DESC
