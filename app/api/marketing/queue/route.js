import { withApiHandler }
from "@/lib/shared/http/withApiHandler";

import { requireFields }
from "@/lib/shared/validation/required";

import { getTenantId }
from "@/lib/shared/tenant/getTenantId";

import { getQueuedCampaigns }
from "@/lib/marketing/services/getQueuedCampaigns";

export const POST = withApiHandler(
  "marketing-queue",

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

    return await getQueuedCampaigns({

      tenantId,

      pageId,

    });

  }
);