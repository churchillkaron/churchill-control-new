import { NextResponse }
from "next/server";

import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

const organizationId = null;

export async function GET(
  request,
  { params }
) {

  const {
    searchParams,
  } = new URL(
    request.url
  );

  const access =
    await requireOrganizationAccess({

      organizationId:
        searchParams.get(
          "organizationId"
        ),

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

  try {

    const journalId =
      params.id;

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

    const {
      data: lines,
      error: linesError,
    } = await supabaseAdmin

      .from("journal_entry_lines")

      .select(`

        *,
        chart_of_accounts (
          id,
          code,
          name,
          category
        )

      `)

      .eq(
        "journal_entry_id",
        journalId
      )

      .order(
        "created_at",
        { ascending: true }
      );

    if (linesError) {

      return NextResponse.json({

        success: false,

        error:
          linesError.message,

      }, {

        status: 500,

      });

    }

    return NextResponse.json({

      success: true,

      journal,
      lines:
        lines || [],

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
