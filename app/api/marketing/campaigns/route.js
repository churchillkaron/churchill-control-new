export const dynamic = "force-dynamic";

import { withApiHandler } from "@/lib/shared/http/withApiHandler";
import { requireFields } from "@/lib/shared/validation/required";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { getMarketingCampaigns } from "@/lib/marketing/services/getMarketingCampaigns";

export const POST = withApiHandler(
  "marketing-campaigns",
  async (request) => {
    const body = await request.json();

    requireFields(body, ["organizationId"]);

    const access = await requireOrganizationAccess({
      organizationId: body.organizationId,
    });

    if (!access.success) {
      const error = new Error(access.error || "Organization access denied");
      error.status = access.status || 403;
      throw error;
    }

    return await getMarketingCampaigns({
      organizationId: access.organizationId,
    });
  },
);
