export const dynamic = "force-dynamic";

import { NextResponse }
from "next/server";

import { executeApproval }
from "@/lib/shared/approvals/executeApproval";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

export async function POST(
  request
) {

  try {

    const body =
      await request.json();

    const {

      entityType,

      entityId,

      currentStatus,

      role,

      actedBy,

      notes,

    } = body;

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

    const tenantId =
      access.tenantId;

    const result =
      await executeApproval({

        tenantId,

        entityType,

        entityId,

        currentStatus,

        role,

        actedBy,

        notes,

      });

    return NextResponse.json({

      success: true,

      result,

    });

  } catch (err) {

    console.error(
      "APPROVAL ERROR:",
      err
    );

    return NextResponse.json(

      {

        success: false,

        error:
          err.message,

      },

      {
        status: 500,
      }

    );

  }

}