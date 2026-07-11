import { validatePackets, type ErpPacket, type PackageGoldItem, type PackagePacket } from "./model.js";

type Metric = { value: number | null; numerator: number; denominator: number };

export function evaluateGoldenSet(packages: PackagePacket[], erp: ErpPacket[], manifest?: any) {
  const validation = validatePackets(packages, erp);
  if (!validation.passed) throw new Error(`Invalid annotation packets:\n${validation.errors.join("\n")}`);
  const packageGold = packages.filter((packet) => packet.annotation_status === "adjudicated" && packet.gold);
  const erpGold = erp.filter((packet) => packet.annotation_status === "adjudicated" && packet.gold);
  const packageMetrics = evaluatePackages(packageGold);
  const erpMetrics = evaluateErp(erpGold);
  const qualityStatus = !packageGold.length && !erpGold.length ? "awaiting_human_annotation" : "partial_or_complete_human_gold";
  const thresholds = thresholdResults({ ...packageMetrics, ...erpMetrics }, manifest, packageGold.length, erpGold.length);
  return {
    schema_version: "product-config-golden-evaluation-v1",
    golden_set_version: manifest?.golden_set_version ?? "product-config-golden-set-v1",
    quality_status: qualityStatus,
    annotation_coverage: {
      product_package: metric(packageGold.length, packages.length),
      erp_identity: metric(erpGold.length, erp.length),
    },
    operational_prediction_baseline: {
      full_fixed_input: manifest?.fixed_input_prediction_baseline ?? null,
      annotation_sample: {
        package_packets: packages.length,
        predicted_package_items: packages.reduce((sum, packet) => sum + packet.prediction.items.length, 0),
        predicted_no_product_evidence: packages.filter((packet) => packet.prediction.evidence_sufficiency === "insufficient_evidence").length,
        erp_packets: erp.length,
        erp_status_counts: countBy(erp, (packet) => packet.prediction.identity_status),
        erp_predicted_coverage: metric(erp.filter((packet) => packet.prediction.identity_status === "matched").length, erp.length),
      },
      note: "These are prediction distributions, not accuracy/precision/recall. Quality metrics remain null until adjudicated gold exists.",
    },
    product_package_metrics: packageMetrics,
    erp_identity_metrics: erpMetrics,
    stratified_metrics: {
      plan_status: strata(packages, erp, "plan_status"),
      template_cohort: strata(packages, erp, "template_cohort"),
      risk_pattern: riskStrata(packages, erp),
    },
    error_details: { product_package: packageMetrics.error_details, erp_identity: erpMetrics.error_details },
    threshold_results: thresholds,
    validation,
  };
}

function evaluatePackages(packets: PackagePacket[]) {
  const eligible = packets.filter((packet) => !["legitimate_ambiguity", "abstain"].includes(packet.gold!.evidence_sufficiency));
  const evidenceEligible = packets.filter((packet) => packet.gold!.evidence_sufficiency !== "abstain");
  let tp = 0;
  let predicted = 0;
  let gold = 0;
  let exact = 0;
  let peerCorrect = 0;
  let peerTotal = 0;
  const errors: Array<{ sample_id: string; field: string; error_type: string }> = [];
  const pairs: Array<{ prediction: Record<string, unknown>; gold: PackageGoldItem }> = [];
  for (const packet of eligible) {
    const predictions = new Map(packet.prediction.items.map((item) => [item.prediction_item_id, item]));
    const matched = packet.gold!.items.filter((item) => item.matched_prediction_item_id && predictions.has(item.matched_prediction_item_id));
    tp += matched.length;
    predicted += packet.prediction.items.length;
    gold += packet.gold!.items.length;
    for (const item of matched) {
      const prediction = predictions.get(item.matched_prediction_item_id!)!;
      pairs.push({ prediction, gold: item });
      for (const field of ["item_name", "product_family", "product_subtype", "item_role", "model"] as const) {
        if (item[field] !== null && normalize(prediction[field]) !== normalize(item[field])) errors.push({ sample_id: packet.sample_id, field, error_type: "value_mismatch" });
      }
    }
    for (let left = 0; left < matched.length; left += 1) for (let right = left + 1; right < matched.length; right += 1) {
      const goldPeer = Boolean(matched[left].peer_group_id && matched[left].peer_group_id === matched[right].peer_group_id);
      const predictionPeer = samePeer(predictions.get(matched[left].matched_prediction_item_id!)!, predictions.get(matched[right].matched_prediction_item_id!)!);
      peerTotal += 1;
      if (goldPeer === predictionPeer) peerCorrect += 1;
      else errors.push({ sample_id: packet.sample_id, field: "peer_relation", error_type: "relation_mismatch" });
    }
    if (matched.length !== packet.prediction.items.length || matched.length !== packet.gold!.items.length) errors.push({ sample_id: packet.sample_id, field: "item_boundary", error_type: "boundary_mismatch" });
    if (packageExact(packet, predictions, matched)) exact += 1;
  }
  const precision = metric(tp, predicted);
  const recall = metric(tp, gold);
  const f1Value = precision.value === null || recall.value === null || precision.value + recall.value === 0 ? null : 2 * precision.value * recall.value / (precision.value + recall.value);
  const evidenceCorrect = evidenceEligible.filter((packet) => {
    const predictedDecision = packet.prediction.evidence_sufficiency;
    const goldDecision = packet.gold!.evidence_sufficiency;
    return predictedDecision === goldDecision;
  }).length;
  return {
    adjudicated_packets: packets.length,
    item_boundary_precision: precision,
    item_boundary_recall: recall,
    item_boundary_f1: { value: f1Value, numerator: tp, denominator: predicted + gold - tp },
    product_family_accuracy: fieldAccuracy(pairs, "product_family"),
    item_name_exact_accuracy: fieldAccuracy(pairs, "item_name", exactString),
    item_name_normalized_accuracy: fieldAccuracy(pairs, "item_name"),
    product_subtype: classificationMetrics(pairs, "product_subtype"),
    item_role: classificationMetrics(pairs, "item_role"),
    model: { accuracy: fieldAccuracy(pairs, "model"), coverage: metric(pairs.filter((pair) => pair.prediction.model !== null && pair.prediction.model !== "").length, pairs.length) },
    peer_relation_accuracy: metric(peerCorrect, peerTotal),
    package_exact_match: metric(exact, eligible.length),
    evidence_sufficiency_accuracy: metric(evidenceCorrect, evidenceEligible.length),
    excluded_legitimate_ambiguity: packets.filter((packet) => packet.gold!.evidence_sufficiency === "legitimate_ambiguity").length,
    excluded_abstain: packets.filter((packet) => packet.gold!.evidence_sufficiency === "abstain").length,
    error_details: errors,
  };
}

function packageExact(packet: PackagePacket, predictions: Map<string, Record<string, unknown>>, matched: PackageGoldItem[]) {
  if (matched.length !== packet.prediction.items.length || matched.length !== packet.gold!.items.length) return false;
  for (const item of matched) {
    const prediction = predictions.get(item.matched_prediction_item_id!)!;
    for (const field of ["item_name", "product_family", "product_subtype", "item_role", "model"] as const) {
      if (item[field] !== null && normalize(prediction[field]) !== normalize(item[field])) return false;
    }
  }
  for (let left = 0; left < matched.length; left += 1) {
    for (let right = left + 1; right < matched.length; right += 1) {
      const goldPeer = Boolean(matched[left].peer_group_id && matched[left].peer_group_id === matched[right].peer_group_id);
      const predictedLeft = predictions.get(matched[left].matched_prediction_item_id!)!;
      const predictedRight = predictions.get(matched[right].matched_prediction_item_id!)!;
      const predictionPeer = samePeer(predictedLeft, predictedRight);
      if (goldPeer !== predictionPeer) return false;
    }
  }
  return true;
}

function fieldAccuracy(pairs: Array<{ prediction: Record<string, unknown>; gold: PackageGoldItem }>, field: keyof PackageGoldItem, equals = normalizedEqual) {
  const eligible = pairs.filter((pair) => pair.gold[field] !== null);
  return metric(eligible.filter((pair) => equals(pair.prediction[field], pair.gold[field])).length, eligible.length);
}

function classificationMetrics(pairs: Array<{ prediction: Record<string, unknown>; gold: PackageGoldItem }>, field: keyof PackageGoldItem) {
  const eligible = pairs.filter((pair) => pair.gold[field] !== null);
  const labels = [...new Set(eligible.map((pair) => normalize(pair.gold[field])))];
  const perClass = Object.fromEntries(labels.map((label) => {
    const truePositive = eligible.filter((pair) => normalize(pair.gold[field]) === label && normalize(pair.prediction[field]) === label).length;
    const falsePositive = eligible.filter((pair) => normalize(pair.gold[field]) !== label && normalize(pair.prediction[field]) === label).length;
    const falseNegative = eligible.filter((pair) => normalize(pair.gold[field]) === label && normalize(pair.prediction[field]) !== label).length;
    const precision = ratio(truePositive, truePositive + falsePositive);
    const recall = ratio(truePositive, truePositive + falseNegative);
    return [label, { precision, recall, f1: ratio(2 * truePositive, 2 * truePositive + falsePositive + falseNegative), support: truePositive + falseNegative }];
  }));
  const f1Values = Object.values(perClass).map((item: any) => item.f1).filter((value): value is number => value !== null);
  return {
    accuracy: metric(eligible.filter((pair) => normalize(pair.prediction[field]) === normalize(pair.gold[field])).length, eligible.length),
    macro_f1: { value: f1Values.length ? average(f1Values) : null, numerator: f1Values.length, denominator: labels.length },
    per_class: perClass,
  };
}

function evaluateErp(packets: ErpPacket[]) {
  const autoMatches = packets.filter((packet) => packet.prediction.identity_status === "matched");
  const correctAutoMatches = autoMatches.filter((packet) => packet.gold!.decision === "unique_match" && candidateMatches(packet.prediction.top_candidates[0], packet.gold!.acceptable_identities[0])).length;
  const uniqueGold = packets.filter((packet) => packet.gold!.decision === "unique_match");
  const top3Hits = uniqueGold.filter((packet) => packet.prediction.top_candidates.slice(0, 3).some((candidate) => candidateMatches(candidate, packet.gold!.acceptable_identities[0]))).length;
  const abstentionGold = packets.filter((packet) => ["legitimate_ambiguity", "insufficient_evidence"].includes(packet.gold!.decision));
  const correctAbstentions = abstentionGold.filter((packet) => packet.prediction.identity_status !== "matched").length;
  const errors = autoMatches.filter((packet) => !(packet.gold!.decision === "unique_match" && candidateMatches(packet.prediction.top_candidates[0], packet.gold!.acceptable_identities[0])))
    .map((packet) => ({ sample_id: packet.sample_id, field: "top1_identity", error_type: packet.gold!.decision === "unique_match" ? "wrong_identity" : "false_auto_match" }));
  return {
    adjudicated_packets: packets.length,
    top1_precision: metric(correctAutoMatches, autoMatches.length),
    top3_recall: metric(top3Hits, uniqueGold.length),
    coverage: metric(autoMatches.length, packets.length),
    false_auto_match_rate: metric(autoMatches.length - correctAutoMatches, autoMatches.length),
    abstention_correctness: metric(correctAbstentions, abstentionGold.length),
    excluded_abstain: packets.filter((packet) => packet.gold!.decision === "abstain").length,
    decision_counts: countBy(packets, (packet) => packet.gold!.decision),
    error_details: errors,
  };
}

function strata(packages: PackagePacket[], erp: ErpPacket[], field: string) {
  const values = [...new Set([...packages, ...erp].flatMap((packet) => list(packet.strata[field])))].sort();
  return Object.fromEntries(values.map((value) => {
    const selectedPackages = packages.filter((packet) => list(packet.strata[field]).includes(value));
    const selectedErp = erp.filter((packet) => list(packet.strata[field]).includes(value));
    return [value, { product_package: evaluatePackages(selectedPackages.filter((packet) => packet.gold && packet.annotation_status === "adjudicated")), erp_identity: evaluateErp(selectedErp.filter((packet) => packet.gold && packet.annotation_status === "adjudicated")) }];
  }));
}

function riskStrata(packages: PackagePacket[], erp: ErpPacket[]) {
  const risks = [...new Set([...packages, ...erp].flatMap((packet) => list(packet.strata.risk_patterns)))].sort();
  return Object.fromEntries(risks.map((risk) => [risk, {
    product_package: evaluatePackages(packages.filter((packet) => list(packet.strata.risk_patterns).includes(risk) && packet.gold && packet.annotation_status === "adjudicated")),
    erp_identity: evaluateErp(erp.filter((packet) => list(packet.strata.risk_patterns).includes(risk) && packet.gold && packet.annotation_status === "adjudicated")),
  }]));
}

function thresholdResults(metrics: Record<string, unknown>, manifest: any, packageCount: number, erpCount: number) {
  if (!manifest?.thresholds) return { status: "not_configured", checks: [] };
  const map: Record<string, Metric | undefined> = {
    item_boundary_f1: (metrics as any).item_boundary_f1,
    product_family_accuracy: (metrics as any).product_family_accuracy,
    product_subtype_macro_f1: (metrics as any).product_subtype?.macro_f1,
    item_role_macro_f1: (metrics as any).item_role?.macro_f1,
    package_exact_match: (metrics as any).package_exact_match,
    erp_top1_precision: (metrics as any).top1_precision,
    erp_top3_recall: (metrics as any).top3_recall,
    erp_coverage: (metrics as any).coverage,
    erp_false_auto_match_rate: (metrics as any).false_auto_match_rate,
    erp_abstention_correctness: (metrics as any).abstention_correctness,
  };
  const minimum = manifest.thresholds.minimum_adjudicated ?? {};
  const checks = Object.entries(manifest.thresholds).filter(([name]) => name !== "minimum_adjudicated").map(([name, threshold]: [string, any]) => {
    const value = map[name]?.value ?? null;
    const scope = name.startsWith("erp_") ? "erp_identity" : "product_package";
    const count = scope === "erp_identity" ? erpCount : packageCount;
    const enoughAnnotations = count >= Number(minimum[scope] ?? 0);
    return { metric: name, scope, adjudicated: count, minimum_adjudicated: minimum[scope] ?? 0, value, threshold, passed: !enoughAnnotations || value === null ? null : threshold.min !== undefined ? value >= threshold.min : value <= threshold.max };
  });
  const packageReady = packageCount >= Number(minimum.product_package ?? 0);
  const erpReady = erpCount >= Number(minimum.erp_identity ?? 0);
  const scopeStatus = (scope: "product_package" | "erp_identity", ready: boolean) => !ready ? "insufficient_adjudicated_annotations" : checks.filter((check) => check.scope === scope).some((check) => check.passed !== true) ? "failed" : "passed";
  const packageStatus = scopeStatus("product_package", packageReady);
  const erpStatus = scopeStatus("erp_identity", erpReady);
  const status = !packageReady && !erpReady ? "no_threshold_eligible_layer" : packageReady && erpReady ? (packageStatus === "passed" && erpStatus === "passed" ? "both_layers_passed" : "failed") : packageReady ? (packageStatus === "passed" ? "package_only_passed" : "failed") : (erpStatus === "passed" ? "erp_only_passed" : "failed");
  return { status, product_package: packageStatus, erp_identity: erpStatus, checks };
}

function candidateMatches(candidate: any, identity: any) { return Boolean(candidate && identity && normalize(candidate.company) === normalize(identity.company) && normalize(candidate.part_num) === normalize(identity.part_num)); }
function metric(numerator: number, denominator: number): Metric { return { value: denominator ? numerator / denominator : null, numerator, denominator }; }
function ratio(numerator: number, denominator: number) { return denominator ? numerator / denominator : null; }
function normalize(value: unknown) { return String(value ?? "").normalize("NFKC").trim().toLowerCase(); }
function normalizedEqual(left: unknown, right: unknown) { return normalize(left) === normalize(right); }
function exactString(left: unknown, right: unknown) { return left === right; }
function samePeer(left: Record<string, unknown>, right: Record<string, unknown>) { return Boolean(left.peer_group_id && left.peer_group_id === right.peer_group_id); }
function list(value: unknown): string[] { return Array.isArray(value) ? value.map(String) : value === undefined ? [] : [String(value)]; }
function average(values: number[]) { return values.reduce((sum, value) => sum + value, 0) / values.length; }
function countBy<T>(rows: T[], key: (row: T) => string): Record<string, number> { const result: Record<string, number> = {}; for (const row of rows) result[key(row)] = (result[key(row)] ?? 0) + 1; return result; }
