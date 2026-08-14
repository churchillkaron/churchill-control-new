export const dynamic = "force-dynamic";

import { withApiHandler } from "@/lib/shared/http/withApiHandler";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import {
  getFinanceSummaryCommand,
} from "@/lib/finance/reporting/runtime/ReportingApplicationService";

function httpError(message, status) {
  const error = new Error(message || "Finance summary access failed");
  error.status = status || 500;
  return error;
}

export const GET = withApiHandler(
  "finance-summary",
  async (request) => {
    const { searchParams } = new URL(request.url);

    const access = await requireOrganizationAccess({
      organizationId:
        searchParams.get("organizationId") ||
        searchParams.get("organization_id"),
      request,
    });

    if (!access.success) {
      throw httpError(access.error, access.status);
    }

    try {
      await checkFinancePermission({
        organizationId: access.organizationId,
        userId: access.user?.id,
        permissionKey: "finance.accounting.view",
        fullAccess: access.permissions?.includes("*") === true,
      });
    } catch (error) {
      if (String(error?.message || "").toLowerCase().includes("permission denied")) {
        error.status = 403;
      }
      throw error;
    }

    return await getFinanceSummaryCommand({
      organizationId: access.organizationId,
    });
  }
);
