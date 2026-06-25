import { createExecutionContext } from "@/lib/ubte/runtime/context/createExecutionContext";
import { registerDomainWorkflows } from "@/lib/ubte/workflows/registerDomainWorkflows";
import { executeWorkflow } from "@/lib/ubte/workflows/runtime/WorkflowEngine";

export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    registerDomainWorkflows();

    const body = await req.json();

    const context =
      createExecutionContext({
        organizationId:
          body.organizationId ||
          body.organization_id,

        actor:
          body.actor || null,

        ...(body.runtime || {}),
      });

    const result =
      await executeWorkflow({
        workflowId:
          body.workflowId ||
          body.workflow_id,

        context,

        input:
          body.input ||
          body.payload ||
          {},
      });

    return Response.json({
      success: true,
      workflowId:
        body.workflowId ||
        body.workflow_id,
      result,
    });

  } catch (error) {

    console.error(
      "[UBTE_WORKFLOW]",
      error
    );

    return Response.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );

  }
}
