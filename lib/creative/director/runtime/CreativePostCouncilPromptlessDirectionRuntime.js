import {
  CreativeUniversalTemporalDirectionRuntime,
} from "./CreativeUniversalTemporalDirectionRuntime";
import {
  sanitizeCreativePromptlessDirectionSpec,
} from "./CreativePromptlessDirectionSpecRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.post-council-promptless-direction.v1",
);

function install() {
  if (CreativeUniversalTemporalDirectionRuntime[INSTALL_FLAG]) return;

  const createWithoutPostCouncilPromptless =
    CreativeUniversalTemporalDirectionRuntime.create.bind(
      CreativeUniversalTemporalDirectionRuntime,
    );

  Object.defineProperty(
    CreativeUniversalTemporalDirectionRuntime,
    INSTALL_FLAG,
    {
      value: true,
      enumerable: false,
      configurable: false,
    },
  );

  CreativeUniversalTemporalDirectionRuntime.create =
    async function createWithPostCouncilPromptlessDirection(input = {}) {
      const result = await createWithoutPostCouncilPromptless(input);
      if (!result?.plan) return result;

      const sanitized = sanitizeCreativePromptlessDirectionSpec(result.plan);

      return {
        ...result,
        plan: sanitized.plan,
        post_council_promptless_direction: {
          contract: "CREATIVE_POST_COUNCIL_PROMPTLESS_DIRECTION_V1",
          removed_prompt_field_count:
            sanitized.evidence.removed_prompt_field_count,
          completed_movement_motivation_count:
            sanitized.evidence.completed_movement_motivation_count,
          validation: sanitized.evidence.validation,
          provider_prompt_serialization_boundary:
            "EXECUTION_TRANSPORT_ONLY",
        },
      };
    };
}

install();

export const CreativePostCouncilPromptlessDirectionRuntime = Object.freeze({
  installed: true,
  contract: "CREATIVE_POST_COUNCIL_PROMPTLESS_DIRECTION_V1",
});
