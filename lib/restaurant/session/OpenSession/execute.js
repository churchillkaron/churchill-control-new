import manifest from "./manifest";
import { applyRules } from "./rules";
import { repository } from "./repository";
import { toDTO } from "./dto";

export async function execute({
  context,
  payload = {},
}) {
  const normalizedPayload =
    await applyRules({
      organizationId:
        context.organizationId,
      payload,
    });

  const result =
    await repository({
      organizationId:
        context.organizationId,
      payload:
        normalizedPayload,
    });

  return toDTO(result);
}

export { manifest };
export { validate } from "./validate";
export { authorize } from "./authorize";
export { publish } from "./events";
export { runAIHooks } from "./ai";
