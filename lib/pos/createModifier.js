import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function createModifier({
  tenant_id,
  name,
  price = 0,
  modifier_group_id,
}) {

  const {
    data,
    error,
  } = await supabaseAdmin
    .from('modifiers')
    .insert([
      {
        tenant_id,
        name,
        price,
        modifier_group_id,
      },
    ])
    .select()
    .single()

  if (error) {
    throw error
  }

  return data
}
