import { withApiHandler }
from "@/lib/shared/http/withApiHandler";

import { getTenantId }
from "@/lib/shared/tenant/getTenantId";

import { getEngineLearningMemory }
from "@/lib/marketing/services/getEngineLearningMemory";

export const POST = withApiHandler(
  "marketing-engine-learning",

  async (request) => {

    const body =
      await request.json();

    const tenantId =
      getTenantId(request);

    const {

      pageId,

    } = body;

    return await getEngineLearningMemory({

      tenantId,

      pageId,

    });

  }
);