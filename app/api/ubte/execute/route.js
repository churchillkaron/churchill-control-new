import {
  execute,
} from "@/lib/ubte/runtime/ExecutionEngine";

export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const body =
      await req.json();

    const result =
      await execute({
        organizationId:
          body.organizationId ||
          body.organization_id,
        domain:
          body.domain,
        capability:
          body.capability,
        action:
          body.action,
        payload:
          body.payload || {},
        actor:
          body.actor || null,
        runtime:
          body.runtime || {},
      });

    return Response.json(result);
  } catch (error) {
    console.error(
      "[UBTE_EXECUTE]",
      error
    );

    return Response.json(
      {
        success: false,
        error:
          error.message,
      },
      {
        status: 500,
      }
    );
  }
}
