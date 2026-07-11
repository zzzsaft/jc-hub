import type { ErpIdentityCandidate } from "./erpIdentityLookup.service.js";

export type ErpPackageProductInput = {
  itemKey: string;
  company?: string;
  productName: string;
  productNumber?: string;
  productNumberConfidence?: "confirmed" | "candidate";
  expectedProdCodes?: string[];
  quantity?: string | number;
};

export type ErpPackageIdentityResolution = {
  itemKey: string;
  status: "matched" | "ambiguous" | "unresolved";
  confidence: number;
  candidate: ErpIdentityCandidate | null;
  alternatives: ErpIdentityCandidate[];
  reasons: string[];
};

type ScoredPair = {
  itemIndex: number;
  candidateIndex: number;
  score: number;
  reasons: string[];
};

export function matchErpPackageProducts(
  items: ErpPackageProductInput[],
  candidates: ErpIdentityCandidate[],
): ErpPackageIdentityResolution[] {
  const usableCandidates = candidates.filter((candidate) => candidate.productNumber);
  const pairs = items.flatMap((item, itemIndex) => usableCandidates.map((candidate, candidateIndex) => ({
    itemIndex,
    candidateIndex,
    ...score(item, candidate, itemIndex),
  }))).sort((left, right) => right.score - left.score || left.itemIndex - right.itemIndex || left.candidateIndex - right.candidateIndex);
  const assignedItems = new Set<number>();
  const assignedCandidates = new Set<number>();
  const assignments = new Map<number, ScoredPair>();
  for (const pair of pairs) {
    if (pair.score < 0.45 || assignedItems.has(pair.itemIndex) || assignedCandidates.has(pair.candidateIndex)) continue;
    assignments.set(pair.itemIndex, pair);
    assignedItems.add(pair.itemIndex);
    assignedCandidates.add(pair.candidateIndex);
  }

  return items.map((item, itemIndex) => {
    const ranked = pairs.filter((pair) => pair.itemIndex === itemIndex);
    const assigned = assignments.get(itemIndex);
    if (!assigned) return { itemKey: item.itemKey, status: "unresolved", confidence: 0, candidate: null, alternatives: [], reasons: ["no_candidate_above_threshold"] };
    const next = ranked.find((pair) => pair.candidateIndex !== assigned.candidateIndex);
    const strongIdentity = assigned.reasons.some((reason) =>
      reason === "product_number_company_exact"
      || reason === "product_number_exact_company_unresolved"
      || reason === "order_number_exact"
    ) || (assigned.reasons.includes("product_number_candidate_exact") && assigned.reasons.some((reason) => /^product_name_similarity:(?:0\.[89]|1\.00)/u.test(reason)));
    const decisive = assigned.reasons.includes("product_number_company_exact")
      || (strongIdentity && assigned.score >= 0.65 && assigned.score - (next?.score ?? 0) >= 0.12);
    return {
      itemKey: item.itemKey,
      status: decisive ? "matched" : "ambiguous",
      confidence: assigned.score,
      candidate: usableCandidates[assigned.candidateIndex] ?? null,
      alternatives: ranked.filter((pair) => pair.candidateIndex !== assigned.candidateIndex && pair.score >= 0.45)
        .slice(0, 3).map((pair) => usableCandidates[pair.candidateIndex]),
      reasons: decisive
        ? assigned.reasons
        : [...assigned.reasons, strongIdentity ? "candidate_gap_too_small" : "name_or_family_hint_only"],
    };
  });
}

function score(item: ErpPackageProductInput, candidate: ErpIdentityCandidate, itemIndex: number) {
  const reasons: string[] = [];
  const candidateNumber = item.productNumberConfidence === "candidate";
  if (!candidateNumber && equal(item.productNumber, candidate.productNumber) && equal(item.company, candidate.company)) return { score: 1, reasons: ["product_number_company_exact"] };
  let value = 0;
  if (equal(item.productNumber, candidate.productNumber)) {
    value += candidateNumber ? 0.35 : 0.85;
    reasons.push(candidateNumber ? "product_number_candidate_exact" : "product_number_exact_company_unresolved");
  }
  if (equal(item.company, candidate.company)) {
    value += 0.1;
    reasons.push("company_match");
  }
  const similarity = textSimilarity(item.productName, candidate.productName ?? "");
  if (similarity >= 0.35) {
    value += similarity * 0.5;
    reasons.push(`product_name_similarity:${similarity.toFixed(2)}`);
  }
  if (item.expectedProdCodes?.some((code) => equal(code, candidate.prodCode))) {
    value += 0.25;
    reasons.push("erp_product_group_match");
  }
  if (candidate.clues.includes("order_number_exact")) {
    value += 0.2;
    reasons.push("order_number_exact");
  }
  if (numericEqual(item.quantity, candidate.quantity)) {
    value += 0.05;
    reasons.push("quantity_match");
  }
  if (Number(candidate.orderLine) === itemIndex + 1) {
    value += 0.05;
    reasons.push("package_order_matches_order_line");
  }
  return { score: Number(Math.min(0.99, value).toFixed(2)), reasons };
}

function textSimilarity(left: string, right: string): number {
  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return Math.min(a.length, b.length) / Math.max(a.length, b.length) * 0.3 + 0.65;
  const leftPairs = bigrams(a);
  const rightPairs = bigrams(b);
  const intersection = [...leftPairs].filter((pair) => rightPairs.has(pair)).length;
  return intersection * 2 / (leftPairs.size + rightPairs.size || 1);
}

function normalize(value: unknown): string {
  return String(value ?? "").normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

function bigrams(value: string): Set<string> {
  if (value.length < 2) return new Set([value]);
  return new Set([...Array(value.length - 1)].map((_, index) => value.slice(index, index + 2)));
}

function equal(left: unknown, right: unknown): boolean {
  return Boolean(normalize(left) && normalize(left) === normalize(right));
}

function numericEqual(left: unknown, right: unknown): boolean {
  const a = Number(left);
  const b = Number(right);
  return Number.isFinite(a) && Number.isFinite(b) && a === b;
}
