import { supabase } from '@/lib/shared/supabase/client'

export async function loadMenu(
  organizationId
) {

  console.log(
    "LOAD MENU TENANT:",
    organizationId
  )

  if (!organizationId) {
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
      organization_id
    `)
    .eq(
      'organization_id',
      organizationId
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
