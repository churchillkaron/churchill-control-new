import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function postJournalToLedger({
  organizationId,
  journalEntryId,
  createdBy = null,
}) {
  if (!organizationId) {
    throw new Error(
      "organizationId required"
    );
  }

  if (!journalEntryId) {
    throw new Error(
      "journalEntryId required"
    );
  }

  const { data: journal, error } =
    await supabaseAdmin
      .from("journal_entries")
      .select(`
        *,
        journal_entry_lines(*)
      `)
      .eq(
        "id",
        journalEntryId
      )
      .eq(
        "organization_id",
        organizationId
      )
      .single();

  if (error) {
    throw error;
  }

  const postingDate =
    journal.posting_date ||
    journal.entry_date;

  if (!postingDate) {
    throw new Error(
      "posting date missing on journal"
    );
  }

  const currencyCode =
    String(
      journal.currency_code || ""
    )
      .trim()
      .toUpperCase();

  if (!currencyCode) {
    throw new Error(
      "currency_code missing on journal"
    );
  }

  const exchangeRate =
    Number(journal.exchange_rate);

  if (
    !Number.isFinite(exchangeRate) ||
    exchangeRate <= 0
  ) {
    throw new Error(
      "exchange_rate missing or invalid on journal"
    );
  }

  const lines =
    journal.journal_entry_lines ||
    [];

  const lineIds =
    lines
      .map(line => line.id)
      .filter(Boolean);

  let existingIds =
    new Set();

  if (lineIds.length) {
    const {
      data: existing,
      error: existingError,
    } =
      await supabaseAdmin
        .from("general_ledger")
        .select(
          "journal_entry_line_id"
        )
        .eq(
          "organization_id",
          organizationId
        )
        .in(
          "journal_entry_line_id",
          lineIds
        );

    if (existingError) {
      throw existingError;
    }

    existingIds =
      new Set(
        (existing || [])
          .map(
            row =>
              row.journal_entry_line_id
          )
      );
  }

  const period =
    String(postingDate)
      .slice(0, 7);

  const rows =
    lines
      .filter(
        line =>
          !existingIds.has(line.id)
      )
      .map(line => {
        const debit =
          Number(line.debit || 0);

        const credit =
          Number(line.credit || 0);

        const balance =
          debit - credit;

        return {
          organization_id:
            organizationId,

          entity_id:
            journal.entity_id,

          period_id:
            line.period_id ||
            journal.period_id ||
            null,

          journal_entry_id:
            journal.id,

          journal_entry_line_id:
            line.id,

          account_id:
            line.account_id,

          department_id:
            line.department_id ||
            null,

          cost_center_id:
            line.cost_center_id ||
            null,

          party_id:
            line.party_id ||
            null,

          project_id:
            line.project_id ||
            null,

          description:
            line.description ||
            null,

          debit,
          credit,
          balance,

          amount:
            Math.abs(balance),

          entry_type:
            debit > 0
              ? "debit"
              : "credit",

          currency:
            currencyCode,

          currency_code:
            currencyCode,

          exchange_rate:
            exchangeRate,

          transaction_date:
            postingDate,

          posting_date:
            postingDate,

          posting_period:
            period,

          reference_type:
            journal.source_module ||
            journal.source_type ||
            null,

          reference_id:
            journal.source_document_id ||
            journal.source_id ||
            null,

          created_by:
            createdBy ||
            journal.created_by ||
            null,
        };
      });

  if (rows.length) {
    const { error: ledgerError } =
      await supabaseAdmin
        .from("general_ledger")
        .insert(rows);

    if (ledgerError) {
      throw ledgerError;
    }
  }

  return {
    success: true,
    journalEntryId:
      journal.id,

    ledgerLines:
      lines.length,

    insertedLines:
      rows.length,

    alreadyPosted:
      lines.length -
      rows.length,
  };
}
