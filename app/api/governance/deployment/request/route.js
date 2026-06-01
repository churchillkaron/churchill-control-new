import { NextResponse } from "next/server";

import {
  requireAuth,
} from "@/lib/shared/auth";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

import createApprovalRequest
from "@/lib/approvals/workflows/createApprovalRequest";

export async function POST(req) {

  try {

    const body =
      await req.json();

    await requireAuth();

    const access =
      await requireOrganizationAccess({

        organizationId:
          body.organizationId,

      });

    if (!access.success) {

      return NextResponse.json(
        {
          success: false,
          error:
            access.error,
        },
        {
          status:
            access.status,
        }
      );

    }

    const tenant_id =
      access.tenantId;

    const result =
      await createApprovalRequest({

        tenant_id:
          tenant_id,

        type:
          "deployment",

        entity_id:
          body.entity_id || null,

        requested_by:
          body.requested_by || "SYSTEM",

        metadata:
          body,

      });

    return NextResponse.json(
      result
    );

  } catch (error) {

    return NextResponse.json(
      {
        success: false,
        error:
          error.message,
      },
      {
        status: 500,
      }
    );

  }

}
