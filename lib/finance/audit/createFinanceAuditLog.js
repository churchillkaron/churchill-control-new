import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function createFinanceAuditLog({
  tenant_id,
  module,
  action,
  reference_id,
  performed_by,
  metadata = {},
}) {

  const {
    data,
    error,
  } = await supabaseAdmin
    .from(
      'finance_audit_logs'
    )
    .insert([
      {
        tenant_id,
        module,
        action,
        reference_id,
        performed_by,
        metadata,
      },
    ])
    .select()
    .single()

  if (error) {
    throw error
  }

  return data
}
