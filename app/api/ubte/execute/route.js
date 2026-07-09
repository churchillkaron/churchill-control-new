import { execute } from "@/lib/ubte/runtime/ExecutionEngine";

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


        runtime: {

          entityId:
            body.entity_id ||
            body.entityId ||
            null,


          periodId:
            body.period_id ||
            body.periodId ||
            null,


          currency:
            body.currency ||
            null,

        },

      });


    return Response.json(
      result
    );


  } catch(error) {

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
