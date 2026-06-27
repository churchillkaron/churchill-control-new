import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function openShift({
  organization_id,
  staff_id,
  staff_name,
  role,
  opened_by,
}) {

  const {
    data,
    error,
  } = await supabaseAdmin
    .from('pos_shifts')
    .insert([
      {
        organization_id,

        staff_id,

        staff_name,

        role,

        opened_by,

        status:
          'OPEN',

        opened_at:
          new Date()
            .toISOString(),
      },
    ])
    .select()
    .single()

  if (error) {
    throw error
  }

  return data
}
