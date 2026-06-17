import { createConciergeRequest }
from "@/lib/hotel/createConciergeRequest";

import { getActiveOrganization }
from "@/lib/workspace/getActiveOrganization";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const organization =
      await getActiveOrganization();

    if (!organization) {

      return Response.json(
        {
          error:
            "Organization not found",
        },
        {
          status: 400,
        }
      );

    }

    const request =
      await createConciergeRequest({

        organizationId:
          organization.id,

        propertyId:
          body.propertyId,

        guestId:
          body.guestId,

        requestType:
          body.requestType,

        details:
          body.details,

        status:
          body.status,

      });

    return Response.json({
      success: true,
      request,
    });

  } catch (error) {

    return Response.json(
      {
        error:
          error.message,
      },
      {
        status: 500,
      }
    );

  }

}
