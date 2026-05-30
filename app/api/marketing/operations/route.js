export const dynamic = "force-dynamic";

import { withApiHandler }
from "@/lib/shared/http/withApiHandler";

import { requireFields }
from "@/lib/shared/validation/required";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

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

    return await getMarketingOperations({

      tenantId,

      pageId,

    });

  }
);