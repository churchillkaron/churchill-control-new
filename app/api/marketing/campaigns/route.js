export const dynamic = "force-dynamic";

import { withApiHandler }
from "@/lib/shared/http/withApiHandler";

import { requireFields }
from "@/lib/shared/validation/required";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

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

    const access =
      await requireOrganizationAccess({

        organizationId:
          body.organizationId,

      });

    if (!access.success) {

      throw new Error(
        access.error
      );

    }

    const tenantId =
      access.tenantId;

    const {

      pageId,

    } = body;

    return await getMarketingCampaigns({

      tenantId,

      pageId,

    });

  }
);