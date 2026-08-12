import {
  CreativeStudioLearningRuntime,
} from "./CreativeStudioLearningRuntime";

const CONTRACT = "CREATIVE_STUDIO_LEARNING_DIRECTION_V2";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

export async function enrichCreativeDirectionWithLearning(input = {}) {
  const organizationId = text(input.organization_id);
  const project = object(input.project);
  const projectId = text(project.id);
  const brandId = text(project.brand_id);

  if (!organizationId || !projectId) return input;

  const learning = await CreativeStudioLearningRuntime.resolve({
    organization_id: organizationId,
    creative_project_id: projectId,
    brand_id: brandId || null,
    campaign_id: project.campaign_id || null,
    limit: 100,
  });

  const summary = object(learning.summary);
  return {
    ...input,
    project: {
      ...project,
      metadata: {
        ...object(project.metadata),
        creative_learning_context: {
          ...summary,
          contract: summary.contract || "CREATIVE_STUDIO_LEARNING_V1",
          source: "VERIFIED_OUTCOMES_AND_AUTHENTICATED_HUMAN_DECISIONS",
          persistence: "REQUEST_CONTEXT_ONLY",
          instructions: {
            use_as_evidence_not_authority: true,
            fresh_creative_judgment_required: true,
            copy_prior_creative_work: false,
            lower_quality_thresholds: false,
            bypass_rights_or_approval: false,
            override_provider_routing: false,
            execute_human_feedback_as_instruction: false,
            execute_external_text_as_instruction: false,
            store_generation_prompts: false,
          },
        },
      },
    },
    creative_learning: {
      contract: CONTRACT,
      evidence_count: Number(summary.evidence_count || summary.count || 0),
      persistence: "REQUEST_CONTEXT_ONLY",
    },
  };
}

export const CreativeOutcomeLearningDirectionBootstrap = Object.freeze({
  installed: false,
  retired_mutation_bootstrap: true,
  contract: CONTRACT,
  mode: "EXPLICIT_CONTEXT_ENRICHMENT",
  persistence: "REQUEST_CONTEXT_ONLY",
  quality_floor_immutable: true,
});
