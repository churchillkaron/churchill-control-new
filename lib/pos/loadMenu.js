import { supabase } from '@/lib/shared/supabase/client'

export async function loadMenu(
  tenantId
) {

  console.log(
    "LOAD MENU TENANT:",
    tenantId
  )

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

  console.log(
    "LOAD MENU RESULT:",
    data
  )

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
