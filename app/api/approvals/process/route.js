import { NextResponse }
from "next/server";

import { executeApproval }
from "@/lib/shared/approvals/executeApproval";

import { getTenantId }
from "@/lib/shared/tenant/getTenantId";

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

    const tenantId =
      getTenantId();

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