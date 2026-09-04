import { ShotRuntime } from "@/lib/creative/shots/runtime/ShotRuntime";
import {
  CreativeDirectorQualityModeRuntime,
} from "@/lib/creative/director/runtime/CreativeDirectorQualityModeRuntime";
import {
  CreativeDirectorPlanProductionBindingRuntime,
} from "@/lib/creative/director/runtime/CreativeDirectorPlanProductionBindingRuntime";

export const CREATIVE_DIRECTOR_PLAN_FINAL_RELEASE_GATE_CONTRACT =
  "AVANTIQO_CREATIVE_DIRECTOR_PLAN_FINAL_RELEASE_GATE_V1";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value, limit = 1200) {
  return String(value ?? "").trim().slice(0, limit);
}

function semanticReviewFromReport(report = {}) {
  const metadata = object(report.metadata);
  const checks = Object.fromEntries(
    list(metadata.checks)
      .filter((check) => text(check?.id, 180))
      .map((check) => [text(check.id, 180), check]),
  );
  return {
    version:
      text(metadata.review_version, 180) ||
      text(metadata.policy?.version, 180) ||
      "PERSISTED_SEMANTIC_REVIEW",
    reviewer: text(metadata.reviewer, 500) || "Avantiqo persisted semantic quality review",
    reviewer_type: text(metadata.reviewer_type, 80) || "AI",
    summary:
      text(report.description, 2400) ||
      text(report.review?.notes, 2400) ||
      "Persisted semantic quality evidence.",
    checks,
    sampled_frames: list(metadata.sampled_frames),
    sampled_clips: list(metadata.sampled_clips),
    sampled_audio_segments: list(metadata.sampled_audio_segments),
  };
}

function semanticReport(result = {}) {
  const direct = object(result.semantic_quality);
  if (direct.id) return direct;
  const post = object(result.post_production);
  const nested = object(post.semantic_quality);
  return nested.id ? nested : null;
}

function repairInstructions(qc = {}) {
  return list(qc.repair?.bounded_repairs)
    .map((entry) => text(entry?.instruction, 1600))
    .filter(Boolean);
}

export const CreativeDirectorPlanFinalReleaseGateRuntime = Object.freeze({
  contract: CREATIVE_DIRECTOR_PLAN_FINAL_RELEASE_GATE_CONTRACT,

  async evaluate({
    organization_id,
    creative_project_id,
    project = {},
    result = {},
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");

    const binding = CreativeDirectorPlanProductionBindingRuntime.binding(project);
    if (!binding) {
      return {
        ...result,
        director_plan_quality_gate: {
          contract: CREATIVE_DIRECTOR_PLAN_FINAL_RELEASE_GATE_CONTRACT,
          applicable: false,
          reason: "NO_BOUND_DIRECTOR_PLAN",
          legacy_or_unbound_production_preserved: true,
        },
      };
    }

    const report = semanticReport(result);
    if (!report?.id) {
      return {
        ...result,
        success: false,
        passed: false,
        status: "DIRECTOR_PLAN_QC_BLOCKED",
        director_plan_quality_gate: {
          contract: CREATIVE_DIRECTOR_PLAN_FINAL_RELEASE_GATE_CONTRACT,
          applicable: true,
          passed: false,
          verdict: "BLOCKED",
          reason: "SEMANTIC_QUALITY_REPORT_REQUIRED",
          binding_contract: binding.contract,
          director_plan_fingerprint: binding.director_plan_fingerprint,
        },
      };
    }

    const shots = await ShotRuntime.list({
      organization_id,
      creative_project_id,
    });
    const evidence = CreativeDirectorPlanProductionBindingRuntime.evidence({
      project,
      shots,
      post_production: result,
    });
    const policy = object(report.metadata?.policy);
    const qc = CreativeDirectorQualityModeRuntime.review({
      director_plan: binding.director_plan,
      semantic_review: semanticReviewFromReport(report),
      semantic_policy: policy,
      governance_evidence: evidence.governance_evidence,
    });

    const gate = {
      contract: CREATIVE_DIRECTOR_PLAN_FINAL_RELEASE_GATE_CONTRACT,
      applicable: true,
      passed: qc.release_ready === true,
      verdict: qc.verdict,
      director_plan_fingerprint: binding.director_plan_fingerprint,
      change_set_fingerprint: binding.change_set_fingerprint || null,
      checkpoint_id: binding.checkpoint_id || null,
      experience_mode: binding.experience_mode || null,
      qc,
      evidence: evidence.details,
      media_generation_authorized: false,
      publication_authorized: false,
    };

    if (gate.passed) {
      return {
        ...result,
        director_plan_quality_gate: gate,
      };
    }

    const status = qc.verdict === "REPAIR"
      ? "DIRECTOR_PLAN_REPAIR_REQUIRED"
      : qc.verdict === "REJECT"
        ? "DIRECTOR_PLAN_QC_REJECTED"
        : "DIRECTOR_PLAN_QC_BLOCKED";

    return {
      ...result,
      success: false,
      passed: false,
      status,
      director_plan_quality_gate: gate,
      repair_instructions: [
        ...new Set([
          ...list(result.repair_instructions),
          ...repairInstructions(qc),
        ]),
      ],
    };
  },
});

export default CreativeDirectorPlanFinalReleaseGateRuntime;
