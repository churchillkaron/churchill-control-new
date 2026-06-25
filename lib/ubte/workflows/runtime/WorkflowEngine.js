import { execute } from "@/lib/ubte/runtime/ExecutionEngine";
import { getWorkflow } from "../WorkflowRegistry";

export async function executeWorkflow({
  workflowId,
  context,
  input = {},
}) {

  const workflow =
    getWorkflow(workflowId);

  let state = {
    ...input,
  };

  for (const step of workflow.steps) {

    const result =
      await execute({

        organizationId:
          context.organizationId,

        domain:
          step.domain,

        capability:
          step.capability,

        action:
          step.action,

        payload:
          state,

        actor:
          context.actor,

        runtime: {
          workspace:
            context.workspace,
          permissions:
            context.permissions,
          locale:
            context.locale,
          currency:
            context.currency,
          timezone:
            context.timezone,
          requestId:
            context.requestId,
          correlationId:
            context.correlationId,
        },

      });

    state = {
      ...state,
      ...result.result,
    };

  }

  return state;

}
