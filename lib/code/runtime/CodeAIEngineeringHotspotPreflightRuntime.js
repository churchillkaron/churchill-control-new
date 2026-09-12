export const CODE_AI_ENGINEERING_HOTSPOT_PREFLIGHT_CONTRACT =
  "AVANTIQO_CODE_AI_ENGINEERING_HOTSPOT_PREFLIGHT_V1";

const PRIORITY_WEIGHT = Object.freeze({ P0: 3, P1: 2, P2: 1 });

function text(value, maximum = 1000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function boundedNumber(value, minimum = 0, maximum = 100) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return minimum;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function priority(value) {
  const normalized = text(value, 8).toUpperCase();
  return Object.hasOwn(PRIORITY_WEIGHT, normalized) ? normalized : "P2";
}

export function projectCodeAIEngineeringHotspotPreflight(backlog = {}) {
  const candidates = list(backlog?.items)
    .map((item) => ({
      priority: priority(item?.priority),
      area: text(item?.area, 120) || "unknown",
      occurrence_count: Math.max(0, Math.floor(boundedNumber(item?.occurrence_count, 0, 10000))),
      max_score: boundedNumber(item?.max_score ?? item?.score, 0, 100),
      evidence: text(item?.evidence, 700) || null,
      recommendation: text(item?.recommendation, 700) || null,
      affected_paths: list(item?.affected_paths).map((path) => text(path, 500)).filter(Boolean).slice(0, 12),
    }))
    .filter((item) => item.area !== "unknown" && (item.priority === "P0" || item.occurrence_count >= 2))
    .sort((left, right) =>
      (PRIORITY_WEIGHT[right.priority] - PRIORITY_WEIGHT[left.priority]) ||
      (right.occurrence_count - left.occurrence_count) ||
      (right.max_score - left.max_score) ||
      left.area.localeCompare(right.area),
    )
    .slice(0, 5);

  return {
    contract: CODE_AI_ENGINEERING_HOTSPOT_PREFLIGHT_CONTRACT,
    evaluated: true,
    active: candidates.length > 0,
    hotspot_count: candidates.length,
    highest_priority: candidates[0]?.priority || null,
    items: candidates,
    current_head_revalidation_required: true,
    repository_evidence_remains_authoritative: true,
    historical_patch_replay_allowed: false,
    automatic_source_mutation_authority: false,
    commit_authority: false,
    production_deploy_authority: false,
    authorization_effect: "NONE",
  };
}

export function unavailableCodeAIEngineeringHotspotPreflight(reason) {
  return {
    contract: CODE_AI_ENGINEERING_HOTSPOT_PREFLIGHT_CONTRACT,
    evaluated: false,
    active: false,
    hotspot_count: 0,
    highest_priority: null,
    items: [],
    reason: "ENGINEERING_HOTSPOT_HISTORY_UNAVAILABLE",
    failure_reason: text(reason, 500) || null,
    current_head_revalidation_required: true,
    repository_evidence_remains_authoritative: true,
    historical_patch_replay_allowed: false,
    automatic_source_mutation_authority: false,
    commit_authority: false,
    production_deploy_authority: false,
    authorization_effect: "NONE",
  };
}

export function formatCodeAIEngineeringHotspotPreflightForObjective(preflight = {}) {
  const items = list(preflight?.items).slice(0, 5);
  if (!items.length) return "";
  const lines = items.map((item) => {
    const paths = list(item?.affected_paths).slice(0, 5).join(", ");
    return [
      `- ${priority(item?.priority)} ${text(item?.area, 120)}: observed ${Number(item?.occurrence_count || 0)} prior mission(s); max score ${Number(item?.max_score || 0)}.`,
      item?.recommendation ? `Recommendation: ${text(item.recommendation, 500)}.` : "",
      paths ? `Previously affected paths: ${paths}.` : "",
    ].filter(Boolean).join(" ");
  });
  return [
    "RECURRING ENGINEERING HOTSPOT PREFLIGHT.",
    "Use this verified repository/ref-scoped history only to improve first-pass investigation, strategy choice, compatibility analysis, and verification coverage.",
    "Revalidate every historical signal against the current repository head before acting. Repository evidence is authoritative; do not replay old patches or infer that a historical dependency still exists.",
    ...lines,
    "This preflight grants no source-mutation, commit, deployment, provider-routing, or governance authority.",
  ].join("\n");
}

export const CodeAIEngineeringHotspotPreflightRuntime = Object.freeze({
  contract: CODE_AI_ENGINEERING_HOTSPOT_PREFLIGHT_CONTRACT,
  project: projectCodeAIEngineeringHotspotPreflight,
  unavailable: unavailableCodeAIEngineeringHotspotPreflight,
  formatForObjective: formatCodeAIEngineeringHotspotPreflightForObjective,
  current_head_revalidation_required: true,
  historical_patch_replay_allowed: false,
  authorization_effect: "NONE",
});

export default CodeAIEngineeringHotspotPreflightRuntime;
