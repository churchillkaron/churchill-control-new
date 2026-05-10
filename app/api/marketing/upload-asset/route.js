export const runtime =
  "nodejs";

import { uploadMarketingAssetFlow }
from "@/lib/services/uploadMarketingAssetFlow";

export async function POST(request) {

  try {

    const formData =
      await request.formData();

    const tenantId =
      formData.get("tenantId");

    const pageId =
      formData.get("pageId");

    const assetType =
      formData.get("assetType");

    const name =
      formData.get("name");

    const file =
      formData.get("file");

    const result =
      await uploadMarketingAssetFlow({

        tenantId,

        pageId,

        file,

        assetType,

        name,

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