import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function createConfiguration({
  organization_id,
  name,
  price = 0,
  configuration_group_id,
}) {

  const {
    data,
    error,
  } = await supabaseAdmin
    .from('modifiers')
    .insert([
      {
        organization_id,
        name,
        price,
        configuration_group_id,
      },
    ])
    .select()
    .single()

  if (error) {
    throw error
  }

  return data
}
