import assert from "node:assert/strict";
import test from "node:test";
import { SqlGuardService, type SqlGuardSchemaRepository } from "../../src/modules/erpSqlAgent/sqlGuard/index.js";

class FakeSchemaRepository implements SqlGuardSchemaRepository {
  private readonly tables = new Set(["erp.poheader", "erp.podetail", "erp.vendor", "erp.invchead", "erp.invcdtl"]);
  private readonly fields = new Set([
    "erp.poheader.company",
    "erp.poheader.ponum",
    "erp.poheader.opendate",
    "erp.poheader.openorder",
    "erp.poheader.approvalstatus",
    "erp.poheader.vendornum",
    "erp.podetail.company",
    "erp.podetail.ponum",
    "erp.podetail.poline",
    "erp.podetail.duedate",
    "erp.vendor.company",
    "erp.vendor.vendornum",
    "erp.vendor.name",
    "erp.invchead.company",
    "erp.invchead.invoicenum",
    "erp.invchead.invoicedate",
    "erp.invchead.posted",
    "erp.invchead.docinvoiceamt",
    "erp.invcdtl.company",
    "erp.invcdtl.invoicenum",
    "erp.invcdtl.docextprice",
  ]);

  /** Checks whether a fake schema table exists. */
  async tableExists(schemaName: string, tableName: string): Promise<boolean> {
    return this.tables.has(`${schemaName.toLowerCase()}.${tableName.toLowerCase()}`);
  }

  /** Checks whether a fake schema field exists. */
  async fieldExists(schemaName: string, tableName: string, fieldName: string): Promise<boolean> {
    return this.fields.has(`${schemaName.toLowerCase()}.${tableName.toLowerCase()}.${fieldName.toLowerCase()}`);
  }
}

const guard = new SqlGuardService(new FakeSchemaRepository());

test("normal SELECT with TOP and Company passes", async () => {
  const result = await guard.validate("SELECT TOP 100 Company, PONum FROM Erp.POHeader");

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.referencedTables, ["Erp.POHeader"]);
  assert(result.referencedFields.includes("Company"));
  assert(result.referencedFields.includes("PONum"));
});

test("template parameters are not schema-validated as fields", async () => {
  const result = await guard.validate("SELECT TOP 100 h.Company, h.PONum FROM Erp.POHeader h WHERE (@companyScope IS NULL OR h.Company = @companyScope) AND (@poNum IS NULL OR h.PONum = @poNum)");

  assert.equal(result.valid, true);
  assert(!result.referencedFields.includes("@companyScope"));
  assert(!result.referencedFields.includes("@poNum"));
});

test("UPDATE is rejected", async () => {
  const result = await guard.validate("UPDATE Erp.POHeader SET OpenOrder = 0");

  assert.equal(result.valid, false);
  assert(result.errors.some((error) => error.includes("banned") || error.includes("Only SELECT")));
});

test("DELETE is rejected", async () => {
  const result = await guard.validate("DELETE FROM Erp.POHeader WHERE Company = 'EPIC06'");

  assert.equal(result.valid, false);
  assert(result.errors.some((error) => error.includes("banned") || error.includes("Only SELECT")));
});

test("DROP is rejected", async () => {
  const result = await guard.validate("DROP TABLE Erp.POHeader");

  assert.equal(result.valid, false);
  assert(result.errors.some((error) => error.includes("banned") || error.includes("Only SELECT")));
});

test("multiple statements are rejected", async () => {
  const result = await guard.validate("SELECT TOP 100 Company, PONum FROM Erp.POHeader; SELECT TOP 100 Company FROM Erp.Vendor");

  assert.equal(result.valid, false);
  assert(result.errors.some((error) => error.includes("Multiple SQL statements")));
});

test("SELECT INTO is rejected", async () => {
  const result = await guard.validate("SELECT TOP 100 Company INTO #P FROM Erp.POHeader");

  assert.equal(result.valid, false);
  assert(result.errors.some((error) => error.includes("SELECT INTO")));
});

test("missing table is rejected", async () => {
  const result = await guard.validate("SELECT TOP 100 Company, PONum FROM Erp.NotARealTable");

  assert.equal(result.valid, false);
  assert(result.errors.some((error) => error.includes("Referenced table does not exist")));
});

test("missing field is rejected", async () => {
  const result = await guard.validate("SELECT TOP 100 Company, MissingField FROM Erp.POHeader");

  assert.equal(result.valid, false);
  assert(result.errors.some((error) => error.includes("Referenced field does not exist")));
});

test("missing Company is rejected", async () => {
  const result = await guard.validate("SELECT TOP 100 PONum FROM Erp.POHeader");

  assert.equal(result.valid, false);
  assert(result.errors.some((error) => error.includes("Company")));
});

test("non-aggregate query without TOP is rejected", async () => {
  const result = await guard.validate("SELECT Company, PONum FROM Erp.POHeader");

  assert.equal(result.valid, false);
  assert(result.errors.some((error) => error.includes("TOP")));
});

test("aggregate query grouped by Company can omit TOP", async () => {
  const result = await guard.validate("SELECT Company, COUNT(*) AS OrderCount FROM Erp.POHeader GROUP BY Company");

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("CTE derived columns are not validated as physical fields", async () => {
  const result = await guard.validate(`
    WITH base AS (
      SELECT Company, InvoiceDate, Posted, DocInvoiceAmt AS SalesAmountUntaxed
      FROM Erp.InvcHead
    ),
    totals AS (
      SELECT Company, SalesAmountUntaxed, Posted, InvoiceDate
      FROM base
    )
    SELECT TOP 100
      Company,
      InvoiceDate AS [时间字段],
      Posted AS [状态过滤],
      SalesAmountUntaxed AS [金额字段],
      N'未说明' AS [税退款口径]
    FROM totals
  `, { module: "finance", references: [{ familyId: "family_finance_001", sourceType: "metric" }] });

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("CTE aliases do not hide invalid physical fields", async () => {
  const result = await guard.validate(`
    WITH base AS (
      SELECT Company, MissingPhysicalField AS SalesAmountUntaxed
      FROM Erp.InvcHead
    )
    SELECT TOP 100 Company, SalesAmountUntaxed FROM base
  `);

  assert.equal(result.valid, false);
  assert(result.errors.some((error) => error.includes("MissingPhysicalField")));
});

test("finance rules are only enabled for finance module", async () => {
  const result = await guard.validate("SELECT TOP 100 Company, InvoiceNum FROM Erp.InvcHead");

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("finance SQL requires approved metric or template reference", async () => {
  const result = await guard.validate(
    "SELECT TOP 100 Company, InvoiceDate AS [时间字段], InvoiceNum, Posted AS [状态过滤], DocInvoiceAmt AS [金额字段], N'未说明' AS [税退款口径] FROM Erp.InvcHead",
    { module: "finance" },
  );

  assert.equal(result.valid, false);
  assert(result.errors.some((error) => error.includes("approved business metric or approved SQL template")));
});

test("finance SQL rejects dataset or family references as metric approval", async () => {
  const result = await guard.validate(
    "SELECT TOP 100 Company, InvoiceDate AS [时间字段], InvoiceNum, Posted AS [状态过滤], DocInvoiceAmt AS [金额字段], N'未说明' AS [税退款口径] FROM Erp.InvcHead",
    { module: "finance", references: [{ familyId: "family_finance_001", sourceType: "family" }] },
  );

  assert.equal(result.valid, false);
  assert(result.errors.some((error) => error.includes("approved business metric or approved SQL template")));
});

test("finance SQL accepts approved metric reference then applies field checks", async () => {
  const result = await guard.validate(
    "SELECT TOP 100 Company, InvoiceDate AS [时间字段], InvoiceNum, Posted AS [状态过滤], DocInvoiceAmt AS [金额字段], N'未说明' AS [税退款口径] FROM Erp.InvcHead",
    { module: "finance", references: [{ familyId: "family_finance_001", sourceType: "metric" }] },
  );

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("strict finance SQL accepts approved template reference", async () => {
  const result = await guard.validate(
    "SELECT TOP 100 Company, InvoiceDate AS [时间字段], InvoiceNum, Posted AS [状态过滤], DocInvoiceAmt AS [金额字段], N'未说明' AS [税退款口径] FROM Erp.InvcHead",
    { module: "finance", references: [{ familyId: "template_001", sourceType: "template" }], financeMode: "strict" },
  );

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("estimated finance SQL accepts historical family reference", async () => {
  const result = await guard.validate(
    "SELECT TOP 100 Company, InvoiceDate AS [时间字段], InvoiceNum, Posted AS [状态过滤], DocInvoiceAmt AS [金额字段], N'估算含税未扣退款' AS [税退款口径] FROM Erp.InvcHead",
    { module: "finance", references: [{ familyId: "family_finance_001", sourceType: "family" }], financeMode: "estimate" },
  );

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("estimated finance SQL requires a reference", async () => {
  const result = await guard.validate(
    "SELECT TOP 100 Company, InvoiceDate AS [时间字段], InvoiceNum, Posted AS [状态过滤], DocInvoiceAmt AS [金额字段], N'估算含税未扣退款' AS [税退款口径] FROM Erp.InvcHead",
    { module: "finance", financeMode: "estimate" },
  );

  assert.equal(result.valid, false);
  assert(result.errors.some((error) => error.includes("historical SQL reference")));
});

test("estimated finance SQL requires scope columns", async () => {
  const result = await guard.validate(
    "SELECT TOP 100 Company, InvoiceDate, InvoiceNum, Posted, DocInvoiceAmt FROM Erp.InvcHead",
    { module: "finance", references: [{ familyId: "family_finance_001", sourceType: "dataset" }], financeMode: "estimate" },
  );

  assert.equal(result.valid, false);
  assert(result.errors.some((error) => error.includes("时间字段")));
});

test("finance SQL rejects detail amount joins without key pre-aggregation", async () => {
  const result = await guard.validate(
    "SELECT h.Company, h.InvoiceDate AS [时间字段], h.Posted AS [状态过滤], SUM(d.DocExtPrice) AS [金额字段], N'未说明' AS [税退款口径] FROM Erp.InvcHead h JOIN Erp.InvcDtl d ON h.Company = d.Company AND h.InvoiceNum = d.InvoiceNum GROUP BY h.Company, h.InvoiceDate, h.Posted",
    { module: "finance", references: [{ familyId: "family_finance_001", sourceType: "metric" }] },
  );

  assert.equal(result.valid, false);
  assert(result.errors.some((error) => error.includes("pre-aggregate detail amount tables")));
});

test("estimated finance SQL rejects detail amount joins without key pre-aggregation", async () => {
  const result = await guard.validate(
    "SELECT h.Company, h.InvoiceDate AS [时间字段], h.Posted AS [状态过滤], SUM(d.DocExtPrice) AS [金额字段], N'估算含税未扣退款' AS [税退款口径] FROM Erp.InvcHead h JOIN Erp.InvcDtl d ON h.Company = d.Company AND h.InvoiceNum = d.InvoiceNum GROUP BY h.Company, h.InvoiceDate, h.Posted",
    { module: "finance", references: [{ familyId: "family_finance_001", sourceType: "family" }], financeMode: "estimate" },
  );

  assert.equal(result.valid, false);
  assert(result.errors.some((error) => error.includes("pre-aggregate detail amount tables")));
});
