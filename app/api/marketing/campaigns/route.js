import { withApiHandler }
from "@/lib/shared/http/withApiHandler";

import { requireFields }
from "@/lib/shared/validation/required";

import { getTenantId }
from "@/lib/shared/tenant/getTenantId";

import { getMarketingCampaigns }
from "@/lib/marketing/services/getMarketingCampaigns";

export const POST = withApiHandler(
  "marketing-campaigns",

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

    return await getMarketingCampaigns({

      tenantId,

      pageId,

    });

  }
);