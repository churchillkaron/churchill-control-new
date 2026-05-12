import { getBusinessRecommendations }
from "@/lib/marketing/ai/recommendations/getBusinessRecommendations";

import { withApiHandler }
from "@/lib/shared/http/withApiHandler";

import { requireFields }
from "@/lib/shared/validation/required";

export const POST = withApiHandler(
  "marketing-recommendations",

  async (request) => {

    const body =
      await request.json();

    requireFields(body, [
      "tenantId",
      "pageId",
    ]);

    const {

      tenantId,

      pageId,

    } = body;

    const result =

      await getBusinessRecommendations({

        tenantId,

        pageId,

      });

    return result;

  }
);