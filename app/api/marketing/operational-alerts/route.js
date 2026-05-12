import { getOperationalAlerts }
from "@/lib/marketing/ai/insights/getOperationalAlerts";

import { withApiHandler }
from "@/lib/shared/http/withApiHandler";

import { requireFields }
from "@/lib/shared/validation/required";

export const POST = withApiHandler(
  "marketing-operational-alerts",

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

      await getOperationalAlerts({

        tenantId,

        pageId,

      });

    return result;

  }
);