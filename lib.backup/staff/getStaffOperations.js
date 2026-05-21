import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function getStaffOperations() {

  const [
    shifts,
    payouts,
    approvals,
  ] = await Promise.all([

    supabaseAdmin
      .from('pos_shifts')
      .select('*'),

    supabaseAdmin
      .from('staff_payouts')
      .select('*'),

    supabaseAdmin
      .from(
        'management_approvals'
      )
      .select('*'),
  ])

  const activeShifts =
    (shifts.data || [])
      .filter(
        shift =>
          shift.status ===
          'OPEN'
      )

  const pendingApprovals =
    (approvals.data || [])
      .filter(
        approval =>
          approval.status !==
          'APPROVED'
      )

  const totalPayouts =
    (payouts.data || [])
      .reduce(
        (
          sum,
          payout
        ) =>
          sum +
          Number(
            payout.amount || 0
          ),
        0
      )

  return {

    active_shifts:
      activeShifts,

    pending_approvals:
      pendingApprovals,

    total_payouts:
      Number(
        totalPayouts.toFixed(2)
      ),
  }
}
