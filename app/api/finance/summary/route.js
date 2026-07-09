export const dynamic = "force-dynamic";

import { withApiHandler } from "@/lib/shared/http/withApiHandler";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import {
  getFinanceSummaryCommand,
} from "@/lib/finance/reporting/runtime/ReportingApplicationService";

export const GET = withApiHandler(
  "finance-summary",
  async (request) => {
    const { searchParams } = new URL(request.url);

    const access =
      await requireOrganizationAccess({
        organizationId:
          searchParams.get("organizationId"),
      });

    if (!access.success) {
      throw new Error(access.error);
    }

    return await getFinanceSummaryCommand({
      organizationId:
        access.organizationId,
    });
  }
);
