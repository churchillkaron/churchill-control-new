import { reason } from "@/lib/creative/reasoning/CreativeReasoningService";

const CONTRACT = "AVANTIQO_CREATIVE_INTELLIGENCE_RELEASE_DIRECTOR_V1";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function basePassed(result = {}) {
  return result?.success === true || result?.passed === true || result?.status === "READY_FOR_APPROVAL";
}

function boundedEvidence(result = {}) {
  return {
    status: result.status || null,
    success: result.success === true,
    passed: result.passed === true,
    workflow_kind: result.workflow_kind || null,
    semantic_status: result.semantic_status || null,
    repair_instructions: list(result.repair_instructions).slice(0, 24),
    premium_temporal_quality: result.premium_temporal_quality || null,
    quality: result.quality || result.quality_review || null,
    validation: result.validation || result.validation_summary || null,
    post_production: result.post_production ? {
      status: result.post_production.status || null,
      quality: result.post_production.quality || null,
      repair_instructions: list(result.post_production.repair_instructions).slice(0, 16),
    } : null,
  };
}

function preserved(result, review = null) {
  return {
    ...result,
    intelligence_release_review: review || {
      contract: CONTRACT,
      evaluated: false,
      underlying_quality_gate_preserved: true,
      can_upgrade_failed_quality: false,
    },
  };
}

export const CreativeIntelligenceReleaseDirectorRuntime = Object.freeze({
  contract: CONTRACT,

  async review({
    organization_id,
    creative_project_id,
    project = {},
    result = {},
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");

    if (!basePassed(result)) {
      return preserved(result, {
        contract: CONTRACT,
        evaluated: false,
        reason: "UNDERLYING_QUALITY_NOT_PASSED",
        underlying_quality_gate_preserved: true,
        can_upgrade_failed_quality: false,
      });
    }

    try {
      const decision = await reason({
        task: "Perform the final accountable executive creative review of a production that has already passed its specialist technical and semantic gates. Decide whether the evidence supports presenting it for human approval or whether a bounded creative repair is still required.",
        input: {
          organization_id,
          creative_project_id,
          objective: project.objective || project.goal || project.brief?.objective || null,
          project_type: project.type || project.workflow_kind || null,
          brand: project.brand || project.brand_context || null,
          business: project.business || project.business_context || null,
          finalisation_evidence: boundedEvidence(result),
        },
        constraints: {
          specialist_quality_gates_are_authoritative: true,
          cannot_upgrade_failed_quality: true,
          cannot_invent_visual_or_audio_evidence: true,
          release_requires_specific_evidence: true,
          prefer_bounded_repair_over_full_regeneration: true,
          preserve_approved_work: true,
          provider_selection_exposed: false,
        },
        outputShape: {
          result: {
            verdict: "READY_FOR_APPROVAL|REPAIR_REQUIRED",
            summary: "string",
            strongest_evidence: ["string"],
            residual_risks: ["string"],
            repair_priorities: ["string"],
            confidence: "number",
          },
        },
        temperature: 0.1,
      });

      const verdict = text(decision?.verdict).toUpperCase();
      const repairRequired = verdict === "REPAIR_REQUIRED";
      const review = {
        contract: CONTRACT,
        evaluated: true,
        verdict: repairRequired ? "REPAIR_REQUIRED" : "READY_FOR_APPROVAL",
        summary: text(decision?.summary) || null,
        strongest_evidence: list(decision?.strongest_evidence).slice(0, 12),
        residual_risks: list(decision?.residual_risks).slice(0, 12),
        repair_priorities: list(decision?.repair_priorities).slice(0, 12),
        confidence: Number(decision?.confidence || 0) || null,
        underlying_quality_gate_preserved: true,
        can_upgrade_failed_quality: false,
        raw_reasoning_persisted: false,
      };

      if (!repairRequired) return preserved(result, review);

      return {
        ...result,
        success: false,
        passed: false,
        status: "INTELLIGENCE_REPAIR_REQUIRED",
        intelligence_release_review: review,
        repair_instructions: [
          ...new Set([
            ...list(result.repair_instructions),
            ...review.repair_priorities,
          ]),
        ],
      };
    } catch (error) {
      console.warn(
        "CREATIVE_INTELLIGENCE_RELEASE_REVIEW_UNAVAILABLE",
        error?.message || error,
      );
      return preserved(result, {
        contract: CONTRACT,
        evaluated: false,
        reason: "INTELLIGENCE_REVIEW_UNAVAILABLE",
        underlying_quality_gate_preserved: true,
        can_upgrade_failed_quality: false,
        raw_reasoning_persisted: false,
      });
    }
  },
});
