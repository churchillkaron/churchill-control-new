import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function getDishModifierGroups(
  dish_id
) {

  const {
    data,
    error,
  } = await supabaseAdmin
    .from('dish_modifier_groups')
    .select(`
      *,
      modifier_groups (
        id,
        name,
        required,
        multi_select,
        max_select
      )
    `)
    .eq('dish_id', dish_id)

  if (error) {
    throw error
  }

  return data
}
