import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function getAccountingDashboard() {

  const [
    payables,
    journalEntries,
    taxReports,
    auditLogs,
    periods,
  ] = await Promise.all([

    supabaseAdmin
      .from(
        'finance_accounts_payable'
      )
      .select('*'),

    supabaseAdmin
      .from(
        'finance_journal_entries'
      )
      .select('*'),

    supabaseAdmin
      .from(
        'finance_tax_reports'
      )
      .select('*'),

    supabaseAdmin
      .from(
        'finance_audit_logs'
      )
      .select('*'),

    supabaseAdmin
      .from(
        'finance_accounting_periods'
      )
      .select('*'),
  ])

  const unpaid =
    (payables.data || [])
      .filter(
        payable =>
          payable.status !==
          'PAID'
      )

  const latestPeriod =
    (periods.data || [])
      .sort(
        (
          a,
          b
        ) => {

          if (
            a.year ===
            b.year
          ) {

            return (
              b.month -
              a.month
            )
          }

          return (
            b.year -
            a.year
          )
        }
      )[0]

  return {

    unpaid_total:
      unpaid.reduce(
        (
          sum,
          payable
        ) =>
          sum +
          Number(
            payable.amount || 0
          ),
        0
      ),

    unpaid_count:
      unpaid.length,

    journal_count:
      (journalEntries.data || [])
        .length,

    tax_reports:
      (taxReports.data || [])
        .length,

    audit_logs:
      (auditLogs.data || [])
        .length,

    latest_period:
      latestPeriod || null,
  }
}
