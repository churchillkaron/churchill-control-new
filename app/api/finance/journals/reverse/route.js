import { NextResponse }
from "next/server";

import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

const tenantId =
  "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4";

export async function POST(request) {

  try {

    const body =
      await request.json();

    const journalId =
      body.journalId;

    const reversalReason =
      body.reason || "Manual reversal";

    if (!journalId) {

      return NextResponse.json({

        success: false,

        error:
          "journalId required",

      }, {

        status: 400,

      });

    }

    // -----------------------------------
    // LOAD ORIGINAL JOURNAL
    // -----------------------------------

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

    // -----------------------------------
    // PREVENT DOUBLE REVERSAL
    // -----------------------------------

    if (
      journal.reversed === true
    ) {

      return NextResponse.json({

        success: false,

        error:
          "Journal already reversed",

      }, {

        status: 400,

      });

    }


    // -----------------------------------
    // PERIOD LOCK VALIDATION
    // -----------------------------------

    const entryDate =
      new Date(
        journal.entry_date
      );

    const isoDate =
      entryDate
        .toISOString()
        .split("T")[0];

    const {
      data: lockedPeriod,
    } = await supabaseAdmin

      .from("accounting_periods")

      .select("*")

      .eq(
        "tenant_id",
        tenantId
      )

      .eq(
        "status",
        "closed"
      )

      .lte(
        "start_date",
        isoDate
      )

      .gte(
        "end_date",
        isoDate
      )

      .maybeSingle();

    if (lockedPeriod) {

      return NextResponse.json({

        success: false,

        error:
          "Journal belongs to a closed accounting period",

      }, {

        status: 400,

      });

    }



    // -----------------------------------
    // LOAD LINES
    // -----------------------------------

    const {
      data: lines,
      error: linesError,
    } = await supabaseAdmin

      .from("journal_entry_lines")

      .select("*")

      .eq(
        "journal_entry_id",
        journalId
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

    // -----------------------------------
    // CREATE REVERSAL JOURNAL
    // -----------------------------------

    const reversalNumber =
      `REV-${journal.entry_number}`;

    const {
      data: reversalJournal,
      error: reversalError,
    } = await supabaseAdmin

      .from("journal_entries")

      .insert([{

        tenant_id:
          tenantId,

        entry_number:
          reversalNumber,

        entry_date:
          new Date()
            .toISOString(),

        description:
          `Reversal of ${journal.entry_number} • ${reversalReason}`,

        source_type:
          "JOURNAL_REVERSAL",

        source_id:
          journal.id,

        reversed:
          false,

        reversal_of:
          journal.id,

        status:
          "posted",

      }])

      .select()

      .single();

    if (reversalError) {

      return NextResponse.json({

        success: false,

        error:
          reversalError.message,

      }, {

        status: 500,

      });

    }

    // -----------------------------------
    // REVERSE LINES
    // -----------------------------------

    const reversalLines =
      lines.map((line) => ({

        tenant_id:
          tenantId,

        journal_entry_id:
          reversalJournal.id,

        account_id:
          line.account_id,

        debit:
          line.credit || 0,

        credit:
          line.debit || 0,

      }));

    const {
      error: insertLinesError,
    } = await supabaseAdmin

      .from("journal_entry_lines")

      .insert(
        reversalLines
      );

    if (insertLinesError) {

      return NextResponse.json({

        success: false,

        error:
          insertLinesError.message,

      }, {

        status: 500,

      });

    }

    // -----------------------------------
    // MARK ORIGINAL REVERSED
    // -----------------------------------

    await supabaseAdmin

      .from("journal_entries")

      .update({

        reversed:
          true,

        reversed_at:
          new Date()
            .toISOString(),

        reversal_journal_id:
          reversalJournal.id,

      })

      .eq(
        "id",
        journal.id
      );

    // -----------------------------------
    // AUDIT LOG
    // -----------------------------------

    await supabaseAdmin

      .from("audit_logs")

      .insert([{

        tenant_id:
          tenantId,

        action:
          "JOURNAL_REVERSED",

        entity_type:
          "journal_entry",

        entity_id:
          journal.id,

        metadata: {

          original:
            journal.entry_number,

          reversal:
            reversalJournal.entry_number,

          reason:
            reversalReason,

        },

      }]);

    return NextResponse.json({

      success: true,

      reversalJournal,

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