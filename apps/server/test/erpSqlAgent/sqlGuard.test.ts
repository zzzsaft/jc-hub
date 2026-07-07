import assert from "node:assert/strict";
import test from "node:test";
import { SqlGuardService, type SqlGuardSchemaRepository } from "../../src/modules/erpSqlAgent/sqlGuard/index.js";

class FakeSchemaRepository implements SqlGuardSchemaRepository {
  private readonly tables = new Set(["erp.poheader", "erp.podetail", "erp.vendor"]);
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
