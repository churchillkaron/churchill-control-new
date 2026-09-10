import crypto from "node:crypto";

const CONTRACT = "CREATIVE_DEPARTMENT_HANDOFF_CHAIN_V1";
const ORDER = Object.freeze([
  "previsualization_supervisor",
  "production_designer",
  "director_of_photography",
  "cg_asset_supervisor",
  "simulation_physics_supervisor",
  "tracking_roto_supervisor",
  "compositing_supervisor",
  "editor",
  "color_di_supervisor",
  "sound_design_supervisor",
  "mix_finishing_engineer",
  "post_production_supervisor",
  "quality_director",
]);

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function hash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
export function buildDepartmentHandoffChain({ previsualization = {}, role_decisions = {} } = {}) {
  const rootDigest = text(previsualization.blueprint_digest);
  const failures = [];
  if (previsualization.contract !== "CREATIVE_SHOT_PREVISUALIZATION_BLUEPRINT_V1") {
    failures.push("DEPARTMENT_HANDOFF_PREVISUALIZATION_CONTRACT_REQUIRED");
  }
  if (previsualization.passed !== true || !rootDigest) {
    failures.push("DEPARTMENT_HANDOFF_PREVISUALIZATION_PASS_REQUIRED");
  }

  const decisions = object(role_decisions);
  const active = ORDER.filter((roleId) => text(decisions[roleId]?.status).toUpperCase() === "ACTIVE");
  let previousDigest = rootDigest;
  const stages = active.map((roleId, index) => {
    const decision = object(decisions[roleId]);
    const stage = {
      index,
      role_id: roleId,
      input_digest: previousDigest || null,
      decision_digest: hash({
        role_id: roleId,
        decision: decision.decision || null,
        evidence: Array.isArray(decision.evidence) ? decision.evidence : [],
        risks: Array.isArray(decision.risks) ? decision.risks : [],
        repair_instructions: Array.isArray(decision.repair_instructions) ? decision.repair_instructions : [],
      }),
    };
    stage.stage_digest = hash(stage);
    previousDigest = stage.stage_digest;
    return stage;
  });

  if (!active.includes("post_production_supervisor") && active.length >= 4) {
    failures.push("DEPARTMENT_HANDOFF_POST_SUPERVISION_REQUIRED");
  }
  return Object.freeze({
    contract: CONTRACT,
    passed: failures.length === 0,
    failures,
    root_previsualization_digest: rootDigest || null,
    active_department_count: active.length,
    stages,
    final_chain_digest: stages.at(-1)?.stage_digest || rootDigest || null,
    zero_provider_calls: true,
    zero_media_generation: true,
  });
}
export const CreativeDepartmentHandoffChainRuntime = Object.freeze({
  contract: CONTRACT,
  ordered_departments: ORDER,
  build: buildDepartmentHandoffChain,
});
