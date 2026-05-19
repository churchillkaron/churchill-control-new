import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function getKitchenQueue() {

  const {
    data,
    error,
  } = await supabaseAdmin
    .from('order_items')
    .select('*')
    .in(
      'kitchen_status',
      [
        'PENDING',
        'FIRED',
        'PREPARING',
        'READY',
      ]
    )
    .order(
      'created_at',
      {
        ascending: true,
      }
    )

  if (error) {
    throw error
  }

  const now =
    Date.now()

  return (data || [])
    .map(item => {

      const created =
        new Date(
          item.created_at
        ).getTime()

      const minutesWaiting =
        Math.floor(
          (
            now -
            created
          ) /
          1000 /
          60
        )

      let sla =
        'GOOD'

      if (
        minutesWaiting >= 20
      ) {

        sla =
          'CRITICAL'

      } else if (
        minutesWaiting >= 15
      ) {

        sla =
          'WARNING'
      }

      return {

        ...item,

        minutesWaiting,

        sla,
      }
    })
}
