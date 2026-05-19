import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function registerPrinter({
  tenant_id,
  printer_name,
  printer_type,
  station,
  ip_address,
}) {

  const {
    data,
    error,
  } = await supabaseAdmin
    .from('pos_printers')
    .insert([
      {
        tenant_id,
        printer_name,
        printer_type,
        station,
        ip_address,
        status: 'ONLINE',
      },
    ])
    .select()
    .single()

  if (error) {
    throw error
  }

  return data
}
