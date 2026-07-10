export type DieBusinessFamily = "board_die" | "sheet_die" | "board_sheet_die" | "film_die" | "unknown";
export type DieProductFamily = "flat_die" | "coating_die" | "round_die" | "unknown";
export type FinishedForm = "board" | "sheet" | "board_sheet" | "film" | "unknown";

export type DieConfigurationDecision = {
  application: string;
  dieProductFamily: DieProductFamily;
  finishedForm: FinishedForm;
  dieBusinessFamily: DieBusinessFamily;
  configurationFamily: string;
  productThicknessMinMm: number | null;
  productThicknessMaxMm: number | null;
  restrictorConfigured: boolean;
  configurationEvidence: string;
  configurationConflict: string;
};

function blocksText(blocksJson: unknown): string {
  if (!blocksJson || typeof blocksJson !== "object" || Array.isArray(blocksJson)) return "";
  const blocks = blocksJson as Record<string, unknown>;
  return String(blocks.llm_text ?? blocks.llmText ?? "");
}

function productThickness(text: string): { min: number | null; max: number | null } {
  const productRow = text.split(/\n(?=Row\s+\d+\s*[:：])/iu)
    .find((row) => /(?:制品|产品|成品)(?:有效)?\s*厚度/iu.test(row));
  const cleaned = String(productRow ?? "").replace(/\[[A-Z]+\d*\]/giu, "");
  const match = cleaned.match(/(?:制品|产品|成品)(?:有效)?\s*厚度(?:\s*范围)?[^\d]{0,80}(\d+(?:\.\d+)?)\s*(?:(?:-|~|～|—|至)\s*(\d+(?:\.\d+)?)\s*)?(?:mm|毫米)/iu);
  if (!match) return { min: null, max: null };
  const first = Number(match[1]);
  const second = match[2] ? Number(match[2]) : first;
  return { min: Math.min(first, second), max: Math.max(first, second) };
}

function hasConfiguredRestrictor(text: string): boolean {
  if (/(?:配置|采用|安装|带有?)\s*(?:了|有)?\s*阻流棒|阻流棒\s*[:：]\s*(?!无|不)(?:有|已配置|\d+\s*°)/iu.test(text)) return true;
  return text.split(/\n(?=Row\s+\d+\s*[:：])/iu).some((row) => {
    if (!/阻流棒/u.test(row)) return false;
    const selected = [...row.matchAll(/(?:\[SEL\]|☑|√)\s*([^\n]*)/giu)].map((match) => match[1].trim());
    return selected.some((value) => !/^(?:无|不配置|不使用|不用)$/u.test(value) && /^(?:有|是)|阻流棒/u.test(value));
  });
}

function productFamily(canonical: string, name: string): DieProductFamily {
  if (canonical === "coating_die" || /涂布|涂覆/u.test(name)) return "coating_die";
  if (canonical === "blown_film_die" || /吹膜|圆模头/u.test(name)) return "round_die";
  if (canonical === "flat_die") return "flat_die";
  if (!canonical && /模头|模具/u.test(name)) return "flat_die";
  return "unknown";
}

function finishedForm(name: string, dieProductFamily: DieProductFamily): FinishedForm {
  if (/板材|厚板|中空(?:格子)?板|波浪瓦/u.test(name)) return "board";
  if (/片材/u.test(name)) return "sheet";
  if (/膜/u.test(name) || dieProductFamily === "round_die") return "film";
  return dieProductFamily === "flat_die" ? "board_sheet" : "unknown";
}

function legacyBusinessFamily(form: FinishedForm): DieBusinessFamily {
  return ({ board: "board_die", sheet: "sheet_die", board_sheet: "board_sheet_die", film: "film_die" } as const)[form as Exclude<FinishedForm, "unknown">] ?? "unknown";
}

export function classifyDieConfiguration(blocksJson: unknown, primaryName: string, canonicalProductFamily = ""): DieConfigurationDecision {
  const text = blocksText(blocksJson);
  const application = /热成型|吸塑/iu.test(`${primaryName}\n${text}`) ? "thermoforming" : "";
  const thickness = productThickness(text);
  const restrictorConfigured = hasConfiguredRestrictor(text);
  const dieProductFamily = productFamily(canonicalProductFamily, primaryName);
  const form = finishedForm(primaryName, dieProductFamily);
  const isDieProduct = dieProductFamily !== "unknown";
  const dieBusinessFamily = legacyBusinessFamily(form);
  let configurationFamily = "";
  let configurationConflict = "";

  if (application === "thermoforming" && isDieProduct) {
    const structuralBoard = restrictorConfigured || (thickness.max !== null && thickness.max > 2.5);
    const structuralSheet = thickness.max !== null && thickness.max <= 2.5 && !restrictorConfigured;
    if (structuralBoard) {
      configurationFamily = restrictorConfigured ? "thermoforming_board_with_restrictor" : "thermoforming_board_structure_expected";
      if (form === "sheet") configurationConflict = "name_sheet_structure_board";
      else if (!restrictorConfigured && thickness.max !== null) configurationConflict = "board_thickness_missing_restrictor_evidence";
    } else if (structuralSheet) {
      configurationFamily = "thermoforming_sheet_standard";
      if (form === "board") configurationConflict = "name_board_structure_sheet";
    } else {
      configurationFamily = "thermoforming_unresolved";
    }
  }

  const evidence = [
    application && `application=${application}`,
    thickness.min !== null && `product_thickness_mm=${thickness.min}-${thickness.max}`,
    restrictorConfigured && "restrictor=configured",
    dieProductFamily !== "unknown" && `die_product_family=${dieProductFamily}`,
    form !== "unknown" && `finished_form=${form}`,
  ].filter(Boolean).join("|");
  return {
    application,
    dieProductFamily,
    finishedForm: form,
    dieBusinessFamily,
    configurationFamily,
    productThicknessMinMm: thickness.min,
    productThicknessMaxMm: thickness.max,
    restrictorConfigured,
    configurationEvidence: evidence,
    configurationConflict,
  };
}
