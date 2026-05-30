import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function buildAccountingIntelligence({
  tenant_id,
}) {

  try {

    const {
      data: journalEntries,
      error,
    } = await supabaseAdmin
      .from("journal_entries")
      .select(`
        id,
        description,
        debit,
        credit,
        created_at
      `)
      .eq(
        "tenant_id",
        tenant_id
      )
      .limit(1000);

    if (error) {
      throw error;
    }

    let totalDebit = 0;

    let totalCredit = 0;

    for (const entry of journalEntries || []) {

      totalDebit +=
        Number(
          entry.debit || 0
        );

      totalCredit +=
        Number(
          entry.credit || 0
        );
    }

    const difference =
      totalDebit -
      totalCredit;

    let accountingStatus =
      "BALANCED";

    if (
      difference !== 0
    ) {

      accountingStatus =
        "UNBALANCED";
    }

    return {

      success: true,

      summary: {

        total_entries:
          journalEntries?.length || 0,

        total_debit:
          totalDebit,

        total_credit:
          totalCredit,

        difference,

        accounting_status:
          accountingStatus,
      },

      recent_entries:
        journalEntries
          ?.slice(0, 20) || [],

      generated_at:
        new Date().toISOString(),
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
