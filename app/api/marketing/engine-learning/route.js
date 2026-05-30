export const dynamic = "force-dynamic";

import { withApiHandler }
from "@/lib/shared/http/withApiHandler";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

import { getEngineLearningMemory }
from "@/lib/marketing/services/getEngineLearningMemory";

export const POST = withApiHandler(
  "marketing-engine-learning",

  async (request) => {

    const body =
      await request.json();

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

    return await getEngineLearningMemory({

      tenantId,

      pageId,

    });

  }
);