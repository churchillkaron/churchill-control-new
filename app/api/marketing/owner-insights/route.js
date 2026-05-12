import { getOwnerInsights }
from "@/lib/marketing/ai/insights/getOwnerInsight";

import { withApiHandler }
from "@/lib/shared/http/withApiHandler";

export const POST = withApiHandler(
  "marketing-owner-insights",

  async (request) => {

    const body =
      await request.json();

    const {

      tenantId,

      pageId,

    } = body;

    if (
      !tenantId ||
      !pageId
    ) {

      throw new Error(
        "Missing tenantId or pageId"
      );

    }

    const result =

      await getOwnerInsights({

        tenantId,

        pageId,

      });

    return result;

  }
);