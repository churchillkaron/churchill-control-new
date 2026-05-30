export const dynamic = "force-dynamic";

import { getBusinessRecommendations }
from "@/lib/marketing/ai/recommendations/getBusinessRecommendations";

import { withApiHandler }
from "@/lib/shared/http/withApiHandler";

import { requireFields }
from "@/lib/shared/validation/required";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

export const POST = withApiHandler(
  "marketing-recommendations",

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

    return await getBusinessRecommendations({

      tenantId,

      pageId,

    });

  }
);