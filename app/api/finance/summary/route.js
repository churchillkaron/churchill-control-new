export const dynamic = "force-dynamic";

import { withApiHandler }
from "@/lib/shared/http/withApiHandler";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

import { getFinanceSummary }
from "@/lib/finance/reporting/capabilities/getFinanceSummary";

export const GET = withApiHandler(
  "finance-summary",

  async (request) => {

    const {
      searchParams,
    } = new URL(
      request.url
    );

    const access =
      await requireOrganizationAccess({

        organizationId:
          searchParams.get(
            "organizationId"
          ),

      });

    if (!access.success) {
      throw new Error(
        access.error
      );
    }

    const organizationId =
      access.organizationId;

    return await getFinanceSummary({
      organizationId,
    });

  }
);