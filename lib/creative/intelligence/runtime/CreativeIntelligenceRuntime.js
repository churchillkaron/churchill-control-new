import {
  analyzeCreativeBusiness,
} from "../analysis/CreativeBusinessAnalyzer";
import {
  reason,
} from "@/lib/creative/reasoning/CreativeReasoningService";
import {
  getPlatformAIService,
} from "@/lib/platform/service-runtime/ai/PlatformAIServiceCatalog";

const CONTRACT = "AVANTIQO_CREATIVE_INTELLIGENCE_PLAN_V1";

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function validCapability(value) {
  const key = text(value);
  return key && getPlatformAIService(key) ? key : null;
}

function capabilityList(value) {
  return [...new Set(list(value).map(validCapability).filter(Boolean))].slice(0, 24);
}

function deterministicPlan({ analysis, objective, explicitOutputs, assets }) {
  return {
    mission_summary: text(objective) || "Create the strongest release-ready business outcome.",
    activated_directors: ["Executive Creative Director", "Quality Director"],
    capability_requirements: [],
    success_criteria: [
      "The result satisfies the approved business objective.",
      "Quality gates pass before release.",
      "Approved assets and locked identity are preserved.",
    ],
    human_decisions_needed: [],
    recommended_outputs: explicitOutputs,
    planning_source: "DETERMINISTIC_CREATIVE_PARTNER_FALLBACK",
    supplied_asset_count: Array.isArray(assets) ? assets.length : 0,
    analysis,
  };
}

async function intelligencePlan({
  organizationId,
  analysis,
  objective,
  brand,
  industry,
  assets,
  explicitOutputs,
}) {
  if (!organizationId) {
    return deterministicPlan({ analysis, objective, explicitOutputs, assets });
  }

  try {
    const decision = await reason({
      task:
        "Act as the Avantiqo Creative Partner. Understand the business mission, activate only the professional directors actually needed, identify canonical Avantiqo capability requirements, define measurable release success criteria, and identify only genuine human-only decisions. Never choose or name AI providers. Do not create generator prompts.",
      input: {
        organization_id: organizationId,
        objective,
        business_analysis: analysis,
        brand,
        industry,
        supplied_asset_count: Array.isArray(assets) ? assets.length : 0,
        requested_outputs: explicitOutputs,
        architecture: {
          flow: [
            "USER",
            "CREATIVE_PARTNER",
            "DIRECTORS",
            "OWNED_ENGINES",
            "QUALITY_REPAIR",
            "RELEASE",
          ],
          provider_selection_boundary: "SERVICE_RUNTIME_ONLY",
          external_providers: "OPTIONAL_FALLBACK_ONLY",
          prompts_are_source_of_truth: false,
        },
      },
      constraints: {
        preserve_explicit_user_outputs: true,
        capability_only_orchestration: true,
        provider_selection_forbidden: true,
        raw_reasoning_persisted: false,
        quality_gate_required: true,
        repair_before_release: true,
      },
      outputShape: {
        result: {
          mission_summary: "string",
          activated_directors: ["string"],
          capability_requirements: ["canonical Avantiqo service capability id"],
          success_criteria: ["string"],
          human_decisions_needed: ["string"],
          recommended_outputs: ["string"],
        },
      },
      temperature: 0.45,
    });

    const result = decision?.result || {};
    return {
      mission_summary: text(result.mission_summary) || text(objective),
      activated_directors: list(result.activated_directors).map(text).filter(Boolean).slice(0, 16),
      capability_requirements: capabilityList(result.capability_requirements),
      success_criteria: list(result.success_criteria).map(text).filter(Boolean).slice(0, 20),
      human_decisions_needed: list(result.human_decisions_needed).map(text).filter(Boolean).slice(0, 12),
      recommended_outputs: explicitOutputs.length
        ? explicitOutputs
        : list(result.recommended_outputs).map(text).filter(Boolean).slice(0, 12),
      planning_source: "AVANTIQO_INTELLIGENCE_GOVERNED_REASONING",
      planning_confidence: Number(decision?.confidence || 0),
      supplied_asset_count: Array.isArray(assets) ? assets.length : 0,
      analysis,
    };
  } catch (error) {
    return {
      ...deterministicPlan({ analysis, objective, explicitOutputs, assets }),
      planning_error_class: "INTELLIGENCE_UNAVAILABLE_FALLBACK_USED",
    };
  }
}

export const CreativeIntelligenceRuntime = {
  contract: CONTRACT,

  async analyzeBusiness({
    organization = {},
    brand = {},
    industry = null,
    objective = "",
    assets = [],
  }) {
    return analyzeCreativeBusiness({
      organization,
      brand,
      industry,
      objective,
      assets,
    });
  },

  async createCreativePlan({
    organizationId = null,
    organization = {},
    brand = {},
    industry = null,
    objective = "",
    assets = [],
    requestedOutputs = [],
  }) {
    const analysis = analyzeCreativeBusiness({
      organization,
      brand,
      industry,
      objective,
      assets,
    });
    const explicitOutputs = Array.isArray(requestedOutputs)
      ? requestedOutputs.filter(Boolean)
      : [];
    const resolvedOrganizationId = text(
      organizationId || organization.organization_id || organization.id,
    );
    const plan = await intelligencePlan({
      organizationId: resolvedOrganizationId,
      analysis,
      objective,
      brand,
      industry,
      assets,
      explicitOutputs,
    });

    return {
      contract: CONTRACT,
      analysis,
      objective,
      mission_summary: plan.mission_summary,
      activated_directors: plan.activated_directors,
      capability_requirements: plan.capability_requirements,
      success_criteria: plan.success_criteria,
      human_decisions_needed: plan.human_decisions_needed,
      requested_outputs: explicitOutputs,
      recommended_outputs: plan.recommended_outputs,
      output_decision_source: explicitOutputs.length
        ? "EXPLICIT_MISSION_CONSTRAINT"
        : plan.planning_source,
      production_direction: {
        source: "AVANTIQO_INTELLIGENCE_AND_DIRECTORS",
        supplied_asset_count: Array.isArray(assets) ? assets.length : 0,
        quality_policy_source: "CREATIVE_QUALITY_POLICY",
        execution_policy: "CAPABILITY_ONLY_SERVICE_RUNTIME_OWNED_FIRST",
        provider_selection_exposed: false,
      },
      intelligence: {
        planning_source: plan.planning_source,
        confidence: plan.planning_confidence || null,
        raw_reasoning_persisted: false,
        provider_selection_exposed: false,
      },
      status: "PLANNED",
    };
  },
};
