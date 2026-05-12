import { getOwnerInsights }
from "@/lib/marketing/ai/insights/getOwnerInsight";

import { withApiHandler }
from "@/lib/shared/http/withApiHandler";

import { requireFields }
from "@/lib/shared/validation/required";

import { getTenantId }
from "@/lib/shared/tenant/getTenantId";

export const POST = withApiHandler(
  "marketing-owner-insights",

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

    return await getOwnerInsights({

      tenantId,

      pageId,

    });

  }
);