import { getCreativeAssets }
from "@/lib/design/assets/getCreativeAssets";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } =
      new URL(request.url);

    const tenantId =
      searchParams.get("tenantId");

    const organizationId =
      searchParams.get("organizationId");

    if (!tenantId) {
      return Response.json(
        {
          success: false,
          error: "tenantId required",
        },
        { status: 400 }
      );
    }

    const assets =
      await getCreativeAssets({
        tenantId,
        organizationId,
      });

    return Response.json({
      success: true,
      assets,
    });

  } catch (error) {

    console.error(
      "DESIGN ASSETS API ERROR",
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
