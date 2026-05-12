import { getOwnerInsights }
from "@/lib/marketing/ai/insights/getOwnerInsight";

import { withApiHandler }
from "@/lib/shared/http/withApiHandler";

import { requireFields }
from "@/lib/shared/validation/required";

export const POST = withApiHandler(
  "marketing-owner-insights",

  async (request) => {

    const body =
      await request.json();

    const {

      tenantId,

      pageId,

    } = body;

    requireFields(body, [
  "tenantId",
  "pageId",
]);

  

    const result =

      await getOwnerInsights({

        tenantId,

        pageId,

      });

    return result;

  }
);