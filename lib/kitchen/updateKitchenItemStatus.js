import { getServiceSupabase } from '@/lib/shared/supabase/service'

const supabase = getServiceSupabase()

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
