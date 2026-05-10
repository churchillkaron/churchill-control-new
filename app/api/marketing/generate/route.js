export const runtime =
  "nodejs";

import { runCampaignGeneration }
from "@/lib/services/runCampaignGeneration";

export async function POST(request) {

  try {

    const body =
      await request.json();

    const {
      tenantId,
      poster,
      selectedAssets,
    } = body;

    const campaign =
      await runCampaignGeneration({

        tenantId,

        poster,

        selectedAssets,

      });

    return Response.json({

      success: true,

      campaign,

    });

  } catch (err) {

    console.error(
      "MARKETING GENERATE API ERROR:",
      err
    );

    return Response.json(
      {
        success: false,
        error:
          err.message ||
          "Generation failed",
      },
      {
        status: 500,
      }
    );

  }

}