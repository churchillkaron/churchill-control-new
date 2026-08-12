import {
  CreativeMasterPlanRuntime,
} from "@/lib/creative/director/runtime/CreativeMasterPlanRuntime";
import {
  CreativeOutcomeLearningRuntime,
} from "./CreativeOutcomeLearningRuntime";

const FLAG = Symbol.for(
  "avantiqo.creative.outcome-learning.direction.v1",
);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

if (!CreativeMasterPlanRuntime[FLAG]) {
  const create = CreativeMasterPlanRuntime.create.bind(CreativeMasterPlanRuntime);

  Object.defineProperty(CreativeMasterPlanRuntime, FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  CreativeMasterPlanRuntime.create = async function createWithOutcomeLearning(
    input = {},
  ) {
    const organizationId = text(input.organization_id);
    const project = object(input.project);
    const projectId = text(project.id);
    const brandId = text(project.brand_id);

    if (!organizationId || !projectId) {
      return create(input);
    }

    const learning = await CreativeOutcomeLearningRuntime.resolve({
      organization_id: organizationId,
      brand_id: brandId || null,
      creative_project_id: brandId ? null : projectId,
      limit: 100,
    });

    const summary = learning.summary || {};
    const projectWithEvidence = {
      ...project,
      metadata: {
        ...object(project.metadata),
        outcome_learning_context: {
          ...summary,
          contract: summary.contract || "CREATIVE_OUTCOME_LEARNING_V1",
          source: "VERIFIED_PUBLISHED_OUTCOMES",
          evidence_scope: brandId ? "ORGANIZATION_BRAND" : "PROJECT_ONLY",
          persistence: "REQUEST_CONTEXT_ONLY",
          instructions: {
            use_as_evidence_not_authority: true,
            copy_prior_creative_work: false,
            lower_quality_thresholds: false,
            bypass_rights_or_approval: false,
            override_provider_routing: false,
            insufficient_evidence_requires_fresh_judgment:
              summary.direction_eligible_count < 3,
          },
        },
      },
    };

    return create({
      ...input,
      project: projectWithEvidence,
    });
  };
}

export const CreativeOutcomeLearningDirectionBootstrap = Object.freeze({
  installed: true,
  contract: "CREATIVE_OUTCOME_LEARNING_DIRECTION_V1",
  persistence: "REQUEST_CONTEXT_ONLY",
  quality_floor_immutable: true,
});
