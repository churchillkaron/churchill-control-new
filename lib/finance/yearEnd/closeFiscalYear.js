import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function closeFiscalYear({
  tenant_id,
  fiscal_year,
  closed_by,
}) {

  const {
    data,
    error,
  } = await supabaseAdmin
    .from(
      'finance_fiscal_years'
    )
    .insert([
      {
        tenant_id,
        fiscal_year,
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
