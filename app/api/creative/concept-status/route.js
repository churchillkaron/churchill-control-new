export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import * as ProductionGraphRepository
from "@/lib/creative/production-graph/repositories/ProductionGraphRepository";
import {
  WORLD_CLASS_CONCEPT_POLICY,
} from "@/lib/creative/director/runtime/CreativeWorldClassConceptIntelligenceRuntime";

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
      });
    }

    const plan = object(graph.metadata?.approval_plan_snapshot);
    const gate = object(plan.world_class_concept_intelligence);
    const council = object(plan.concept_council);
    const councilGate = object(gate.council || council.world_class_gate);
    const selection = object(council.selection);
    const selected = object(selection.selected_concept);
    const scorecard = object(
      selection.selected_scorecard ||
      councilGate.selected_scorecard,
    );

    const validContract = gate.contract === WORLD_CLASS_CONCEPT_POLICY.contract;
    const passed = validContract && gate.passed === true;
    const temporal = text(plan.workflow_kind).toUpperCase() === "TEMPORAL";
    const temporalPassed = !temporal || (
      councilGate.passed === true &&
      Number(councilGate.weighted_score) >= WORLD_CLASS_CONCEPT_POLICY.minimum_weighted_score &&
      Number(councilGate.selector_confidence) >= WORLD_CLASS_CONCEPT_POLICY.minimum_selector_confidence
    );

    return Response.json({
      success: true,
      status: passed && temporalPassed ? "A_GRADE" : "BLOCKED",
      policy: WORLD_CLASS_CONCEPT_POLICY,
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
      gate: {
        contract: gate.contract || null,
        passed,
        temporal_council_enforced: gate.temporal_council_enforced === true,
        temporal_council_passed: temporalPassed,
        b_grade_concept_forbidden: gate.b_grade_concept_forbidden === true,
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
