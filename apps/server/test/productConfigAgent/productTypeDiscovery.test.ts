import assert from "node:assert/strict";
import test from "node:test";
import {
  decideDocumentPrimaryProduct,
  deriveBusinessDate,
  extractOpenTitleNames,
  selectDiscoverySamples,
  type DiscoveryDetail,
  type DiscoveryMetadata,
} from "../../src/modules/productConfigAgent/productType/discovery.js";
import {
  classifyProductItemRole,
  resolveProductType,
  type ProductTypeDefinition,
} from "../../src/modules/productConfigAgent/productType/resolver.js";
import { classifyDieConfiguration } from "../../src/modules/productConfigAgent/productType/dieConfiguration.js";
import { expectedErpProductGroups, interpretErpProductGroup } from "../../src/modules/productConfigAgent/productType/erpTaxonomy.js";

const productTypes: ProductTypeDefinition[] = [
  { canonicalValue: "flat_die", displayName: "平模头", aliases: ["模头", "片材模头"] },
  { canonicalValue: "blown_film_die", displayName: "吹膜模头", aliases: ["吹膜模头"] },
  { canonicalValue: "coating_die", displayName: "涂布模头", aliases: ["涂布模头"] },
  { canonicalValue: "spinneret_plate", displayName: "喷丝板", aliases: ["PP医用熔喷模头"] },
  { canonicalValue: "filter", displayName: "换网器", aliases: ["换网器", "换网器支架"] },
];

test("specific and longest product type matches run before generic die fallback", () => {
  assert.equal(resolveProductType("五层吹膜模头", productTypes)?.canonicalValue, "blown_film_die");
  assert.equal(resolveProductType("钙钛矿涂覆模头", productTypes)?.canonicalValue, "coating_die");
  assert.equal(resolveProductType("PP医用熔喷模头", productTypes)?.canonicalValue, "spinneret_plate");
  assert.equal(resolveProductType("普通模头", productTypes)?.canonicalValue, "flat_die");
});

test("component names never become main product roles", () => {
  const filter = resolveProductType("换网器支架", productTypes);
  assert.equal(filter?.canonicalValue, "filter");
  assert.equal(classifyProductItemRole("换网器支架", filter), "component");
  assert.equal(classifyProductItemRole("模唇", null), "component");
});

test("future block dates are rejected and cannot enter recent strata", () => {
  const result = deriveBusinessDate({
    documentId: 1n,
    createdAt: new Date("2026-06-01T00:00:00Z"),
    hasPlan: false,
    blockDateLabel: "订单日期",
    blockDateValue: "2028-08-04",
  }, "2026-07-10");
  assert.equal(result.explicit, false);
  assert.equal(result.source, "document_created_at_import_fallback");
  assert.match(result.rejectedReason, /future_blocks_date/);
});

test("open title extraction does not require a product name whitelist", () => {
  const names = extractOpenTitleNames("生产明细表-260001-2026-06-01-新型边料回收机.xlsx");
  assert.ok(names.some((name) => name.includes("边料回收机")));
  assert.deepEqual(
    extractOpenTitleNames("生产明细表-(2025-573)-片材模头及连接器.xlsx"),
    ["片材模头", "连接器"],
  );
  assert.deepEqual(
    extractOpenTitleNames("生产明细表-260004-2026-06-01-CPE流延膜模头(380V) 新式真空箱.xlsx"),
    ["CPE流延膜模头", "(380V) 新式真空箱"],
  );
});

test("document evidence fusion overrides generic plan and rejects component-only documents", () => {
  const detail: DiscoveryDetail = {
    documentId: 1n,
    fileName: "生产明细表-260001-2026-06-01-五层吹膜模头.xlsx",
    blocksJson: { llm_text: "一、五层吹膜模头" },
    planJson: { items: [{ item_name: "模头" }] },
    extractionJson: null,
    normalizedExtractionJson: null,
  };
  const resolved = decideDocumentPrimaryProduct(detail, productTypes);
  assert.equal(resolved.productFamily, "blown_film_die");
  assert.equal(resolved.itemRole, "main_product");

  const compound = decideDocumentPrimaryProduct({
    ...detail,
    fileName: "生产明细表-260003-2026-06-01-片材模头及换网器.xlsx",
    blocksJson: { llm_text: "" },
    planJson: null,
  }, productTypes);
  assert.equal(compound.productFamily, "flat_die");
  assert.deepEqual(compound.packageItems.map((item) => item.productFamily).sort(), ["filter", "flat_die"]);

  const componentOnly = decideDocumentPrimaryProduct({
    ...detail,
    documentId: 2n,
    fileName: "生产明细表-260002-2026-06-01-换网器支架.xlsx",
    blocksJson: { llm_text: "一、换网器支架" },
    planJson: { items: [{ item_name: "换网器支架" }] },
  }, productTypes);
  assert.equal(componentOnly.itemRole, "unresolved");
  assert.equal(componentOnly.unresolvedReason, "component_or_accessory_only");
});

test("thermoforming uses application-specific thickness and restrictor configuration rules", () => {
  const sheet = classifyDieConfiguration({ llm_text: "应用：热成型\nRow 11:\n[A11] 制品有效厚度\n[B11] 0.15-2.5mm\n阻流棒：不配置" }, "热成型片材模头");
  assert.equal(sheet.dieBusinessFamily, "sheet_die");
  assert.equal(sheet.configurationFamily, "thermoforming_sheet_standard");
  assert.equal(sheet.productThicknessMaxMm, 2.5);

  const board = classifyDieConfiguration({ llm_text: "应用：热成型\nRow 11:\n[A11] 产品厚度\n[B11] 3-6mm\n[SEL] 配置阻流棒，角度30°" }, "热成型片材模头");
  assert.equal(board.finishedForm, "sheet");
  assert.equal(board.dieBusinessFamily, "sheet_die");
  assert.equal(board.configurationFamily, "thermoforming_board_with_restrictor");
  assert.equal(board.configurationConflict, "name_sheet_structure_board");

  const missingStructure = classifyDieConfiguration({ llm_text: "吸塑用途\nRow 11:\n[A11] 成品厚度范围 3-4mm\n[A12] 阻流棒" }, "热成型模头");
  assert.equal(missingStructure.restrictorConfigured, false);
  assert.equal(missingStructure.finishedForm, "board_sheet");
  assert.equal(missingStructure.dieBusinessFamily, "board_sheet_die");
  assert.equal(missingStructure.configurationConflict, "board_thickness_missing_restrictor_evidence");

  const unselected = classifyDieConfiguration({ llm_text: "Row 27:\n[A27] 阻流棒配置\n[B27]\n[SEL] 无\n[ ] 有\n[ ] 45°阻流棒" }, "热成型片材模头");
  assert.equal(unselected.restrictorConfigured, false);
  const selected = classifyDieConfiguration({ llm_text: "Row 27:\n[A27] 阻流棒配置\n[B27] [SEL] 有" }, "热成型片材模头");
  assert.equal(selected.restrictorConfigured, true);

  const namedBoard = classifyDieConfiguration({ llm_text: "热成型\nRow 11:\n[A11] 制品厚度\n[B11] 0.2-1.5mm" }, "PS板材模头", "flat_die");
  assert.equal(namedBoard.finishedForm, "board");
  assert.equal(namedBoard.configurationConflict, "name_board_structure_sheet");
});

test("the thermoforming 2.5mm boundary is not applied globally", () => {
  const result = classifyDieConfiguration({ llm_text: "Row 11:\n[A11] 制品厚度范围：3-5mm" }, "某工艺片材模头");
  assert.equal(result.application, "");
  assert.equal(result.dieBusinessFamily, "sheet_die");
  assert.equal(result.configurationFamily, "");
  const nonDie = classifyDieConfiguration({ llm_text: "热成型\nRow 11:\n[A11] 制品厚度范围：3-5mm" }, "连接器");
  assert.equal(nonDie.dieBusinessFamily, "unknown");
  assert.equal(nonDie.configurationFamily, "");
});

test("die product family, finished form, and ERP product group are independent", () => {
  const castFilm = classifyDieConfiguration(null, "CPE流延膜模头", "flat_die");
  assert.equal(castFilm.dieProductFamily, "flat_die");
  assert.equal(castFilm.finishedForm, "film");
  const round = classifyDieConfiguration(null, "五层吹膜圆模头", "blown_film_die");
  assert.equal(round.dieProductFamily, "round_die");
  assert.equal(round.finishedForm, "film");
  assert.deepEqual(expectedErpProductGroups("flat_die"), ["0910", "0918"]);
  assert.deepEqual(expectedErpProductGroups("feedblock"), ["0904"]);
  assert.equal(classifyDieConfiguration(null, "PP医用熔喷模头", "spinneret_plate").dieProductFamily, "unknown");
  assert.deepEqual(interpretErpProductGroup("091001"), { kind: "manufacturing_intermediate" });
  assert.deepEqual(interpretErpProductGroup("P504"), { kind: "internal_asset" });
});

test("open product candidates keep the most specific name within one package", () => {
  const result = decideDocumentPrimaryProduct({
    documentId: 3n,
    fileName: "生产明细表-PVC波浪瓦定型板.xlsx",
    blocksJson: { llm_text: "一、定型板" },
    planJson: null,
    extractionJson: null,
    normalizedExtractionJson: null,
  }, productTypes);
  assert.deepEqual(result.packageItems.map((item) => item.productName), ["PVC波浪瓦定型板"]);
});

test("sampling is deterministic, unique, no-plan heavy, and excludes future recent dates", () => {
  const rows: DiscoveryMetadata[] = [];
  for (let index = 1; index <= 520; index += 1) {
    const hasPlan = index % 4 === 0;
    rows.push({
      documentId: BigInt(index),
      createdAt: new Date("2026-06-01T00:00:00Z"),
      hasPlan,
      blockDateLabel: "订单日期",
      blockDateValue: index <= 420 ? "2026-06-01" : "2028-08-04",
    });
  }
  const first = selectDiscoverySamples(rows, "2026-07-10");
  const second = selectDiscoverySamples(rows, "2026-07-10");
  assert.equal(first.samples.length, 400);
  assert.equal(new Set(first.samples.map((item) => String(item.documentId))).size, 400);
  assert.ok(first.samples.filter((item) => !item.hasPlan).length >= 280);
  assert.equal(first.samples.some((item) => item.businessDate.explicit && item.businessDate.value > "2026-07-10"), false);
  assert.deepEqual(first.samples.map((item) => item.documentId), second.samples.map((item) => item.documentId));
});
