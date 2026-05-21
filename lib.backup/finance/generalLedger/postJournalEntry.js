import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function postJournalEntry({
  tenant_id,
  reference_type,
  reference_id,
  entries = [],
  created_by,
}) {

  const totalDebits =
    entries
      .filter(
        entry =>
          entry.type ===
          'DEBIT'
      )
      .reduce(
        (
          sum,
          entry
        ) =>
          sum +
          Number(
            entry.amount || 0
          ),
        0
      )

  const totalCredits =
    entries
      .filter(
        entry =>
          entry.type ===
          'CREDIT'
      )
      .reduce(
        (
          sum,
          entry
        ) =>
          sum +
          Number(
            entry.amount || 0
          ),
        0
      )

  if (
    totalDebits !==
    totalCredits
  ) {
    throw new Error(
      'Journal entry is unbalanced'
    )
  }

  const {
    data: journal,
    error:
      journalError,
  } = await supabaseAdmin
    .from(
      'finance_journal_entries'
    )
    .insert([
      {
        tenant_id,
        reference_type,
        reference_id,
        total_debits:
          totalDebits,
        total_credits:
          totalCredits,
        created_by,
      },
    ])
    .select()
    .single()

  if (journalError) {
    throw journalError
  }

  const rows =
    entries.map(
      entry => ({
        journal_entry_id:
          journal.id,

        account_code:
          entry.account_code,

        account_name:
          entry.account_name,

        type:
          entry.type,

        amount:
          entry.amount,
      })
    )

  const {
    error: lineError,
  } = await supabaseAdmin
    .from(
      'finance_journal_lines'
    )
    .insert(rows)

  if (lineError) {
    throw lineError
  }

  return journal
}
