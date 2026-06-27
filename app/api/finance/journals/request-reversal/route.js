import { NextResponse }
from "next/server";

import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

const organizationId = null;

export async function POST(request) {

  try {

    const body =
      await request.json();

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

    const organizationId =
      access.organizationId;

    const {

      journalId,
      reason,
      requestedBy,

    } = body;

    if (
      !journalId ||
      !reason
    ) {

      return NextResponse.json({

        success: false,

        error:
          "journalId and reason required",

      }, {

        status: 400,

      });

    }

    // -----------------------------------
    // LOAD JOURNAL
    // -----------------------------------

    const {
      data: journal,
      error: journalError,
    } = await supabaseAdmin

      .from("journal_entries")

      .select("*")

      .eq(
        "organization_id",
        organizationId
      )

      .eq(
        "id",
        journalId
      )

      .single();

    if (
      journalError ||
      !journal
    ) {

      return NextResponse.json({

        success: false,

        error:
          "Journal not found",

      }, {

        status: 404,

      });

    }

    // -----------------------------------
    // PREVENT DUPLICATE REQUEST
    // -----------------------------------

    if (
      journal.reversal_status ===
      "pending"
    ) {

      return NextResponse.json({

        success: false,

        error:
          "Reversal already pending approval",

      }, {

        status: 400,

      });

    }

    // -----------------------------------
    // UPDATE STATUS
    // -----------------------------------

    const {
      error: updateError,
    } = await supabaseAdmin

      .from("journal_entries")

      .update({

        reversal_status:
          "pending",

        reversal_reason:
          reason,

        reversal_requested_by:
          requestedBy || "system",

        reversal_requested_at:
          new Date()
            .toISOString(),

      })

      .eq(
        "id",
        journalId
      );

    if (updateError) {

      return NextResponse.json({

        success: false,

        error:
          updateError.message,

      }, {

        status: 500,

      });

    }

    // -----------------------------------
    // AUDIT LOG
    // -----------------------------------

    await supabaseAdmin

      .from("audit_logs")

      .insert([{

        organization_id:
          organizationId,

        action:
          "REVERSAL_REQUESTED",

        entity_type:
          "journal_entry",

        entity_id:
          journalId,

        metadata: {

          reason,
          requestedBy,

        },

      }]);

    return NextResponse.json({

      success: true,

      message:
        "Reversal request submitted",

    });

  } catch (error) {

    return NextResponse.json({

      success: false,

      error:
        error.message,

    }, {

      status: 500,

    });

  }

}
