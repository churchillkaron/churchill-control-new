import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function createPrepBatch({
  tenant_id,
  ingredient_id,
  quantity,
  prepared_by,
  expires_at,
}) {

  const {
    data,
    error,
  } = await supabaseAdmin
    .from('production_prep_batches')
    .insert([
      {
        tenant_id,
        ingredient_id,
        quantity,
        remaining_quantity:
          quantity,
        prepared_by,
        expires_at,
        status:
          'ACTIVE',
      },
    ])
    .select()
    .single()

  if (error) {
    throw error
  }

  return data
}
