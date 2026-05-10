export const runtime =
  "nodejs";

import { analyzeMarketingAsset }
from "@/lib/ai/analyzeMarketingAsset";

export async function POST(request) {

  try {

    const body =
      await request.json();

    const result =
      await analyzeMarketingAsset({

        fileUrl:
          body.fileUrl,

        assetType:
          body.assetType,

      });

    return Response.json({

      success: true,

      result,

    });

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