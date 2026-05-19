import { supabase } from '@/lib/shared/supabase/client'

export async function loadMenu(
  tenantId
) {

  if (!tenantId) {
    return []
  }

  const {
    data,
    error,
  } = await supabase
    .from('dishes')
    .select(`
      id,
      name,
      category,
      price,
      cost,
      tenant_id
    `)
    .eq(
      'tenant_id',
      tenantId
    )
    .order('name')

  if (error) {

    console.error(
      'LOAD MENU ERROR:',
      error
    )

    return []
  }

  return (
    data || []
  ).map(dish => ({
    ...dish,
    stock_quantity: 'READY',
  }))
}
