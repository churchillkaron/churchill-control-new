import {
  CreativeMasterPlanCompletionRuntimeV2,
} from "./CreativeMasterPlanCompletionRuntimeV2";

export const CreativeMasterPlanCompletionRuntime = Object.freeze({
  complete(input = {}) {
    const completed = CreativeMasterPlanCompletionRuntimeV2.complete(input);
    return {
      ...completed,
      completion: {
        ...completed.completion,
        legacy_entrypoint: "CREATIVE_MASTER_PLAN_COMPLETION_V1",
        delegated_to_contract: "CREATIVE_MASTER_PLAN_COMPLETION_V3",
        deterministic_schema_completion_used: false,
        fixed_template_completion_used: false,
        provider_prompt_generation_executed: false,
        negative_prompt_generation_executed: false,
        story_authority_unchanged: true,
      },
    };
  },
});
