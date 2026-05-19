import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function getFloorTables() {

  const {
    data,
    error,
  } = await supabaseAdmin
    .from('restaurant_tables')
    .select('*')
    .order(
      'table_name',
      {
        ascending: true,
      }
    )

  if (error) {
    throw error
  }

  return data || []
}
