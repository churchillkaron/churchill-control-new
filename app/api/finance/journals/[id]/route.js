import { NextResponse }
from "next/server";

import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

const tenantId =
  "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4";

export async function GET(
  request,
  { params }
) {

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
        "tenant_id",
        tenantId
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
