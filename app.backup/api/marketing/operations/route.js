export const dynamic = "force-dynamic";

import { withApiHandler }
from "@/lib/shared/http/withApiHandler";

import { requireFields }
from "@/lib/shared/validation/required";

import { getTenantId }
from "@/lib/shared/tenant/getTenantId";

import { getMarketingOperations }
from "@/lib/marketing/services/getMarketingOperations";

export const POST = withApiHandler(
  "marketing-operations",

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

    return await getMarketingOperations({

      tenantId,

      pageId,

    });

  }
);