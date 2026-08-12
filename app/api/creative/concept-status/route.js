export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import * as ProductionGraphRepository
from "@/lib/creative/production-graph/repositories/ProductionGraphRepository";
import {
  WORLD_CLASS_CONCEPT_POLICY,
} from "@/lib/creative/director/runtime/CreativeWorldClassConceptPolicy";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function newest(items = []) {
  return [...items].sort((left, right) =>
    Date.parse(right.updated_at || right.created_at || 0) -
    Date.parse(left.updated_at || left.created_at || 0),
  )[0] || null;
}

function rejectedConcepts(council = {}) {
  const byId = new Map(
    list(council.concepts).map((concept) => [text(concept.id), concept]),
  );
  return list(council.selection?.rejected_concepts).map((rejected) => ({
    concept_id: text(rejected.concept_id),
    title: byId.get(text(rejected.concept_id))?.title || null,
    reason: text(rejected.reason),
  }));
}

function enforcedPolicy(plan = {}) {
  const policy = object(
    plan.creative_intelligence_policy ||
    plan.world_class_concept_intelligence?.policy,
  );
  return Object.keys(policy).length ? policy : WORLD_CLASS_CONCEPT_POLICY;
}

function regenerationStatus(plan = {}, policy = WORLD_CLASS_CONCEPT_POLICY) {
  const regeneration = object(plan.autonomous_concept_regeneration);
  const regenerationPolicy = object(policy.regeneration);
  return {
    contract: regeneration.contract || regenerationPolicy.contract || null,
    enabled: Boolean(regenerationPolicy.contract),
    regenerated: regeneration.regenerated === true,
    rounds_used: Number(regeneration.rounds_used || 1),
    max_rounds: Number(
      regeneration.max_rounds ||
      regenerationPolicy.max_rounds ||
      regenerationPolicy.default_max_rounds ||
      1,
    ),
    prior_failed_rounds: list(regeneration.prior_failed_rounds),
    stopped_on_a_grade: regeneration.stopped_on_a_grade === true,
    fail_closed_when_exhausted:
      regeneration.fail_closed_when_exhausted === true ||
      regenerationPolicy.fail_closed_when_exhausted === true,
    maximum_cross_round_similarity:
      Number(
        regeneration.maximum_cross_round_similarity ??
        regenerationPolicy.maximum_cross_round_similarity ??
        0,
      ),
    provider_execution:
      regeneration.provider_execution ||
      regenerationPolicy.provider_execution ||
      null,
    policy_resolution:
      regeneration.policy_resolution ||
      policy.policy_resolution ||
      null,
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = text(
      url.searchParams.get("organization_id") ||
      url.searchParams.get("organizationId"),
    );
    const creativeProjectId = text(
      url.searchParams.get("creative_project_id") ||
      url.searchParams.get("creativeProjectId") ||
      url.searchParams.get("project_id"),
    );

    if (!organizationId || !creativeProjectId) {
      return Response.json(
        {
          success: false,
          error: "organization_id and creative_project_id required",
        },
        { status: 400 },
      );
    }

    const access = await requireOrganizationAccess({
      organizationId,
      request,
      requiredAnyPermission: [
        "creative.*",
        "creative.execute",
        "creative.production.run",
        "creative.release.approve",
      ],
    });

    if (!access.success) {
      return Response.json(access, { status: access.status || 403 });
    }

    const graphs = await ProductionGraphRepository.listByProject({
      organization_id: organizationId,
      creative_project_id: creativeProjectId,
    });
    const graph = newest(graphs);

    if (!graph) {
      return Response.json({
        success: true,
        status: "AWAITING_DIRECTION",
        policy: WORLD_CLASS_CONCEPT_POLICY,
        concept: null,
        regeneration: regenerationStatus({}, WORLD_CLASS_CONCEPT_POLICY),
      });
    }

    const plan = object(graph.metadata?.approval_plan_snapshot);
    const policy = enforcedPolicy(plan);
    const gate = object(plan.world_class_concept_intelligence);
    const council = object(plan.concept_council);
    const councilGate = object(gate.council || council.world_class_gate);
    const selection = object(council.selection);
    const selected = object(selection.selected_concept);
    const scorecard = object(
      selection.selected_scorecard ||
      councilGate.selected_scorecard,
    );

    const validContract = gate.contract === policy.contract;
    const passed = validContract && gate.passed === true;
    const temporal = text(plan.workflow_kind).toUpperCase() === "TEMPORAL";
    const temporalPassed = !temporal || (
      councilGate.passed === true &&
      Number(councilGate.weighted_score) >= policy.minimum_weighted_score &&
      Number(councilGate.selector_confidence) >= policy.minimum_selector_confidence
    );

    return Response.json({
      success: true,
      status: passed && temporalPassed ? "A_GRADE" : "BLOCKED",
      policy,
      workflow_kind: plan.workflow_kind || null,
      concept: {
        id: plan.selected_concept_id || selected.id || null,
        title: plan.concept?.title || selected.title || null,
        thesis:
          plan.concept?.creative_thesis ||
          selected.central_proposition ||
          null,
        narrative:
          plan.concept?.narrative ||
          selected.causal_story ||
          null,
        selection_reason:
          plan.concept_selection_reason ||
          selection.selection_reason ||
          null,
        decisive_strengths: list(selection.decisive_strengths),
        mandatory_repairs: list(selection.mandatory_repairs_before_planning),
        weighted_score:
          councilGate.weighted_score ??
          scorecard.weighted_score ??
          null,
        selector_confidence:
          councilGate.selector_confidence ??
          selection.confidence ??
          null,
        critic_scores:
          councilGate.critic_scores ||
          scorecard.critic_scores ||
          {},
        distinctness: council.distinctness || null,
        rejected_concepts: rejectedConcepts(council),
      },
      regeneration: regenerationStatus(plan, policy),
      gate: {
        contract: gate.contract || null,
        passed,
        temporal_council_enforced: gate.temporal_council_enforced === true,
        temporal_council_passed: temporalPassed,
        b_grade_concept_forbidden: gate.b_grade_concept_forbidden === true,
        global_minimums_cannot_be_lowered:
          policy.policy_resolution?.global_minimums_cannot_be_lowered === true,
        policy_resolution_contract:
          policy.policy_resolution?.contract || null,
      },
      read_only: true,
      provider_execution: false,
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error?.message || String(error),
      },
      { status: 500 },
    );
  }
}
