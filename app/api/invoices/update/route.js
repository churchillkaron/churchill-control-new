export const dynamic = "force-dynamic";

import { NextResponse }
from "next/server";

import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

import { executeApproval }
from "@/lib/shared/approvals/executeApproval";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

// =========================
// PROCESS INVOICE APPROVAL
// =========================

export async function POST(
  req
) {

  try {

    const body =
      await req.json();

    const {

      id,

      currentStatus,

      role,

      actedBy,

      notes,

      organizationId,

    } = body;

    if (!id) {

      return NextResponse.json(

        {
          error:
            "Missing invoice id",
        },

        {
          status: 400,
        }

      );

    }

    // -----------------------------------
    // LOCKED RECORD PROTECTION
    // -----------------------------------

    const {
      data: existing,
      error: fetchError,
    } = await supabaseAdmin

      .from("invoices")

      .select("status")

      .eq("id", id)

      .single();

    if (fetchError) {

      throw fetchError;

    }

    if (
      existing?.status ===
      "locked"
    ) {

      return NextResponse.json(

        {
          success: false,
          error:
            "Locked accounting record",
        },

        {
          status: 403,
        }

      );

    }

    // -----------------------------------
    // TENANT
    // -----------------------------------

    const access =
      await requireOrganizationAccess({

        organizationId,

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

    // -----------------------------------
    // EXECUTE GOVERNED WORKFLOW
    // -----------------------------------

    const result =
      await executeApproval({

        tenantId,

        entityType:
          "invoice",

        entityId:
          id,

        currentStatus:
          currentStatus ||
          "pending_manager",

        role:
          role ||
          "manager",

        actedBy:
          actedBy ||
          null,

        notes:
          notes ||
          "Invoice approval",

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