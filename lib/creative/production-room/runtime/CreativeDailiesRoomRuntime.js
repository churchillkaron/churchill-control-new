import * as AssetGraphRepository from "../../assets/graph/repositories/CreativeAssetGraphRepository.js";

export const CREATIVE_DAILIES_ROOM_CONTRACT = "CREATIVE_DAILIES_ROOM_V1";
export const CREATIVE_DAILIES_RELEASE_FLOOR = 94;

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const REQUIRED_REVIEW_FAMILIES = Object.freeze([
  "DIRECTING",
  "CINEMATOGRAPHY",
  "CONTINUITY",
  "TECHNICAL_TRUTH",
  "PERCEPTUAL_QUALITY",
]);

export function evaluateDailiesTake({ take = {}, reviews = [], floor = CREATIVE_DAILIES_RELEASE_FLOOR } = {}) {
  const failures = [];
  const rows = list(reviews);
  if (!text(take.id || take.asset_id || take.task_id)) failures.push("DAILIES_TAKE_ID_REQUIRED");
  if (!rows.length) failures.push("DAILIES_REVIEWS_REQUIRED");

  const families = new Set(rows.map((row) => text(row.family).toUpperCase()).filter(Boolean));
  for (const family of REQUIRED_REVIEW_FAMILIES) {
    if (!families.has(family)) failures.push(`DAILIES_REVIEW_FAMILY_REQUIRED:${family}`);
  }

  for (const row of rows) {
    const id = text(row.reviewer_id || row.family);
    const score = number(row.score);
    if (!id) failures.push("DAILIES_REVIEWER_ID_REQUIRED");
    if (score === null || score < 0 || score > 100) failures.push(`DAILIES_REVIEW_SCORE_INVALID:${id || "unknown"}`);
    if (row.passed !== true || score === null || score < floor) failures.push(`DAILIES_REVIEW_REJECTED:${id || "unknown"}`);
    if (!list(row.evidence).length) failures.push(`DAILIES_REVIEW_EVIDENCE_REQUIRED:${id || "unknown"}`);
  }
  const weakest = rows.length ? Math.min(...rows.map((row) => number(row.score) ?? 0)) : 0;
  const passed = failures.length === 0 && weakest >= floor;
  return Object.freeze({
    contract: CREATIVE_DAILIES_ROOM_CONTRACT,
    passed,
    status: passed ? "APPROVED_FOR_EDITORIAL" : "REJECTED_FOR_REPAIR",
    required_floor: floor,
    weakest_score: weakest,
    failures: [...new Set(failures)],
    take_id: text(take.id || take.asset_id || take.task_id) || null,
    approved_take: passed ? take : null,
    reviews: rows,
  });
}

export function evaluateDailiesBatch({ takes = [], reviews_by_take = {}, floor = CREATIVE_DAILIES_RELEASE_FLOOR } = {}) {
  const results = list(takes).map((take) => {
    const id = text(take.id || take.asset_id || take.task_id);
    return evaluateDailiesTake({ take, reviews: list(reviews_by_take[id]), floor });
  });
  const approved = results.filter((result) => result.passed);
  const rejected = results.filter((result) => !result.passed);
  return Object.freeze({
    contract: CREATIVE_DAILIES_ROOM_CONTRACT,
    passed: results.length > 0 && rejected.length === 0,
    results,
    approved_take_ids: approved.map((result) => result.take_id),
    rejected_take_ids: rejected.map((result) => result.take_id),
    editorial_may_consume_only_approved_take_ids: true,
  });
}

export async function recordDailiesAssetDecision({ organization_id, asset_node_id, reviews = [], floor = CREATIVE_DAILIES_RELEASE_FLOOR } = {}) {
  if (!organization_id || !asset_node_id) throw new Error("DAILIES_ASSET_CONTEXT_REQUIRED");
  const node = await AssetGraphRepository.getById(asset_node_id);
  if (!node || String(node.organization_id) !== String(organization_id)) {
    throw new Error("DAILIES_ASSET_NOT_FOUND_FOR_ORGANIZATION");
  }
  const report = evaluateDailiesTake({ take: { id: asset_node_id }, reviews, floor });
  return AssetGraphRepository.update(asset_node_id, {
    metadata: {
      ...(node.metadata || {}),
      dailies_contract: CREATIVE_DAILIES_ROOM_CONTRACT,
      dailies_approved: report.passed === true,
      dailies_report: report,
      include_in_master: report.passed === true,
    },
  });
}

export const CreativeDailiesRoomRuntime = Object.freeze({
  contract: CREATIVE_DAILIES_ROOM_CONTRACT,
  floor: CREATIVE_DAILIES_RELEASE_FLOOR,
  evaluateTake: evaluateDailiesTake,
  evaluateBatch: evaluateDailiesBatch,
  recordAssetDecision: recordDailiesAssetDecision,
});