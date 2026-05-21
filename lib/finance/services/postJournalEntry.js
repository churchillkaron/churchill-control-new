import { getServiceSupabase } from '@/lib/shared/supabase/service'

const supabase = getServiceSupabase()

export async function postJournalEntry({
  tenantId,
  journalEntryId,
}) {

  if (!tenantId) {
    throw new Error('tenantId required')
  }

  if (!journalEntryId) {
    throw new Error('journalEntryId required')
  }

  const {
    data: lines,
    error: lineError,
  } = await supabase
    .from('journal_entry_lines')
    .select('*')
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'journal_entry_id',
      journalEntryId
    )

  if (lineError) {
    throw new Error(lineError.message)
  }

  const debit =
    (lines || []).reduce(
      (sum, line) =>
        sum +
        Number(line.debit || 0),
      0
    )

  const credit =
    (lines || []).reduce(
      (sum, line) =>
        sum +
        Number(line.credit || 0),
      0
    )

  if (
    Number(debit.toFixed(2)) !==
    Number(credit.toFixed(2))
  ) {

    throw new Error(
      'Journal entry is unbalanced'
    )
  }

  const {
    error: updateError,
  } = await supabase
    .from('journal_entries')
    .update({

      status:
        'posted',

      posted_at:
        new Date().toISOString(),

      total_debit:
        debit,

      total_credit:
        credit,

    })
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'id',
      journalEntryId
    )

  if (updateError) {
    throw new Error(updateError.message)
  }

  await supabase
    .from('audit_logs')
    .insert({

      tenant_id:
        tenantId,

      module:
        'finance',

      action:
        'POST_JOURNAL_ENTRY',

      reference_id:
        journalEntryId,

      created_at:
        new Date().toISOString(),

    })

  return {

    success: true,

    journalEntryId,

    debit,

    credit,

  }
}
