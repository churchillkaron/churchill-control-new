export const dynamic = "force-dynamic";

import { withApiHandler }
from "@/lib/shared/http/withApiHandler";

import { getTenantId }
from "@/lib/shared/tenant/getTenantId";

import { getFinanceSummary }
from "@/lib/finance/services/getFinanceSummary";

export const GET = withApiHandler(
  "finance-summary",

  async (request) => {

    const tenantId =
      getTenantId(request);

    return await getFinanceSummary({
      tenantId,
    });

  }
);