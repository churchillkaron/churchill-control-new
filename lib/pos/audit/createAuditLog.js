import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function createAuditLog({
  tenant_id,
  user_id,
  action,
  entity_type,
  entity_id,
  metadata = {},
}) {

  const {
    data,
    error,
  } = await supabaseAdmin
    .from('pos_audit_logs')
    .insert([
      {
        tenant_id,
        user_id,
        action,
        entity_type,
        entity_id,
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
