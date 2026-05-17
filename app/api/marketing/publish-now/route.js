export const dynamic = "force-dynamic";

export const runtime =
  "nodejs";

import { publishCampaignNow }
from "@/lib/marketing/services/publishCampaignNow";

export async function POST(request) {

  try {

    const body =
      await request.json();

    const result =
      await publishCampaignNow({

        campaignId:
          body.campaignId,

      });

    return Response.json(result);

  } catch (err) {

    return Response.json(
      {
        success: false,
        error:
          err.message,
      },
      {
        status: 500,
      }
    );

  }

}