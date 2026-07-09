import { execute } from "@/lib/ubte/runtime/ExecutionEngine";

export async function POST(req) {

  const body = await req.json();

  try {

    const result =
      await execute({

        organizationId:
          body.organizationId ||
          body.organization_id,

        domain:
          "finance",

        capability:
          body.capability,

        action:
          body.action,

        payload:
          body.payload || {},

        actor:
          body.actor || null,

        runtime:
          {
            entityId:
              body.entity_id ||
              body.entityId,

            periodId:
              body.period_id ||
              body.periodId,

            currency:
              body.currency,

          },

      });


    return Response.json(result);

  } catch (error) {

    return Response.json(
      {
        success:false,
        error:error.message,
      },
      {
        status:500,
      }
    );

  }

}
