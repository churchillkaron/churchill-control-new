export const dynamic = "force-dynamic";

import { NextResponse }
from "next/server";

import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

import { rejectApproval }
from "@/lib/shared/approvals/rejectApproval";

import { createApprovalLog }
from "@/lib/shared/approvals/createApprovalLog";

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

      reason,

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

    // rejection payload

    const rejection =
      rejectApproval({

        reason,

        rejectedBy:
          actedBy,

      });

    // resolve table

    let table = null;

    switch (
      entityType
    ) {

      case "invoice":
        table =
          "invoices";
        break;

      case "payroll":
        table =
          "monthly_payroll";
        break;

      case "expense":
        table =
          "expenses";
        break;

      default:
        throw new Error(
          "Invalid entity type"
        );

    }

    // update entity

    const {
      error:
        updateError,
    } =
      await supabaseAdmin

        .from(table)

        .update({

          status:
            rejection.status,

          rejected_reason:
            rejection.rejected_reason,

          rejected_by:
            rejection.rejected_by,

          rejected_at:
            rejection.rejected_at,

        })

        .eq(
          "id",
          entityId
        );

    if (updateError) {

      throw updateError;

    }

    // audit log

    await createApprovalLog({

      tenantId,

      entityType,

      entityId,

      fromStatus:
        currentStatus,

      toStatus:
        rejection.status,

      actedBy,

      role,

      notes:
        reason,

    });

    return NextResponse.json({

      success: true,

    });

  } catch (err) {

    console.error(
      "REJECTION ERROR:",
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