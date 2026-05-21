import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function getSecurityOverview() {

  const [
    audits,
    permissions,
    approvals,
    shifts,
  ] = await Promise.all([

    supabaseAdmin
      .from(
        'finance_audit_logs'
      )
      .select('*'),

    supabaseAdmin
      .from(
        'finance_role_permissions'
      )
      .select('*'),

    supabaseAdmin
      .from(
        'management_approvals'
      )
      .select('*'),

    supabaseAdmin
      .from('pos_shifts')
      .select('*'),
  ])

  const pendingApprovals =
    (approvals.data || [])
      .filter(
        approval =>
          approval.status !==
          'APPROVED'
      ).length

  const activeShifts =
    (shifts.data || [])
      .filter(
        shift =>
          shift.status ===
          'OPEN'
      ).length

  return {

    audit_events:
      (audits.data || [])
        .length,

    permissions:
      (permissions.data || [])
        .length,

    pending_approvals:
      pendingApprovals,

    active_sessions:
      activeShifts,

    security_status:
      'SECURE',
  }
}
