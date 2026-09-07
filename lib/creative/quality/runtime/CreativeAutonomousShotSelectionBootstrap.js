import crypto from "node:crypto";
import { CreativeShotCandidateSelectionRuntime } from "./CreativeShotCandidateSelectionRuntime";

const FLAG = Symbol.for("avantiqo.creative.autonomous-shot-selection.v1");
const CONTRACT = "AVANTIQO_AUTONOMOUS_SHOT_SELECTION_V1";

function text(value) { return String(value ?? "").trim(); }
function finite(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}
function hash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

function rankEvidence(selection = {}) {
  const winner = selection.winner || null;
  const alternatives = list(selection.alternatives);
  if (!winner) return {
    status: "BLOCKED",
    confidence: 0,
    margin: null,
    reason: selection.reason || "NO_QUALIFIED_WINNER",
  };
  const firstAlternative = alternatives[0] || null;
  const winnerMerit = finite(winner.cinematic) ?? 0;
  const nextMerit = finite(firstAlternative?.cinematic);
  const margin = nextMerit === null ? null : Number((winnerMerit - nextMerit).toFixed(3));
  return {
    status: "SELECTED",
    confidence: nextMerit === null ? 1 : Math.max(0, Math.min(1, Number((margin / 10).toFixed(3)))),
    margin,
    reason: nextMerit === null
      ? "ONLY_WORLD_CLASS_CANDIDATE"
      : margin > 0
        ? "HIGHEST_CINEMATIC_MERIT_AFTER_HARD_GATES"
        : "DETERMINISTIC_TIE_BREAK_AFTER_EQUAL_CINEMATIC_MERIT",
  };
}

function rejectionReasons(selection = {}) {
  return list(selection.candidates).map((candidate) => {
    const failed = list(candidate.failed_checks).map(text).filter(Boolean);
    const reasons = [
      ...(candidate.passed === true ? [] : ["PERCEPTUAL_REVIEW_FAILED"]),
      ...(candidate.hard_human_quality_passed === false ? ["HARD_HUMAN_QUALITY_FAILED"] : []),
      ...failed,
      ...((finite(candidate.weakest) ?? 0) < Number(selection.world_class_floor || 94) ? ["WORLD_CLASS_WEAKEST_DIMENSION_FLOOR_NOT_MET"] : []),
      ...((finite(candidate.overall) ?? 0) < Number(selection.world_class_floor || 94) ? ["WORLD_CLASS_OVERALL_FLOOR_NOT_MET"] : []),
    ];
    return {
      asset_node_id: candidate.asset_node_id,
      rejected: reasons.length > 0,
      reasons: [...new Set(reasons)],
      repair_instructions: list(candidate.repair_instructions),
    };
  });
}

function install() {
  if (CreativeShotCandidateSelectionRuntime[FLAG]) return;
  const original = CreativeShotCandidateSelectionRuntime.select.bind(CreativeShotCandidateSelectionRuntime);
  Object.defineProperty(CreativeShotCandidateSelectionRuntime, FLAG, { value: true });

  CreativeShotCandidateSelectionRuntime.select = async function autonomousSelect(input = {}) {
    const selection = await original(input);
    const evidence = rankEvidence(selection);
    const decision = {
      contract: CONTRACT,
      shot_id: selection.shot_id || input.shot_id || null,
      status: selection.status,
      world_class_floor: selection.world_class_floor || CreativeShotCandidateSelectionRuntime.world_class_floor,
      hard_gates_precede_ranking: true,
      beauty_score_cannot_override_gate_failure: true,
      selection_policy: "HARD_GATES_THEN_CINEMATIC_MERIT_THEN_DETERMINISTIC_TIE_BREAK",
      winner: selection.winner || null,
      qualified_candidate_count: selection.qualified_candidate_count || 0,
      confidence: evidence.confidence,
      cinematic_margin_to_runner_up: evidence.margin,
      selection_reason: evidence.reason,
      rejected_candidates: rejectionReasons(selection),
      automatic_selection_authorized: selection.status === "SELECTED",
      automatic_rejection_authorized: true,
      human_override_not_inferred: true,
      provider_calls_added: 0,
    };
    decision.decision_hash = hash(decision);
    return { ...selection, autonomous_selection: decision };
  };
}

install();

export const CreativeAutonomousShotSelectionBootstrap = Object.freeze({
  installed: true,
  contract: CONTRACT,
  hard_gates_precede_ranking: true,
  provider_calls_added: 0,
});
