import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function closeMonthEndPeriod({
  tenant_id,
  month,
  year,
  closed_by,
}) {

  const {
    data,
    error,
  } = await supabaseAdmin
    .from(
      'finance_accounting_periods'
    )
    .insert([
      {
        tenant_id,
        month,
        year,
        status:
          'CLOSED',
        closed_by,
        closed_at:
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
