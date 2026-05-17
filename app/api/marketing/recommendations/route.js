export const dynamic = "force-dynamic";

import { getBusinessRecommendations }
from "@/lib/marketing/ai/recommendations/getBusinessRecommendations";

import { withApiHandler }
from "@/lib/shared/http/withApiHandler";

import { requireFields }
from "@/lib/shared/validation/required";

import { getTenantId }
from "@/lib/shared/tenant/getTenantId";

export const POST = withApiHandler(
  "marketing-recommendations",

  async (request) => {

    const body =
      await request.json();

    requireFields(body, [
      "pageId",
    ]);

    const tenantId =
      getTenantId(request);

    const {

      pageId,

    } = body;

    return await getBusinessRecommendations({

      tenantId,

      pageId,

    });

  }
);