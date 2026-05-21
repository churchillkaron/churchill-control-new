import { createClient } from '@supabase/supabase-js'

const supabase =
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

export async function updateKitchenItemStatus({
  itemId,
  status,
}) {

  const {
    error,
  } = await supabase

    .from('order_items')

    .update({
      status,
    })

    .eq(
      'id',
      itemId
    )

  if (error) {
    throw error
  }

  return {
    success: true,
  }
}
