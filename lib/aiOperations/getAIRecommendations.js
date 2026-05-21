import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function getAIRecommendations() {

  const [
    payments,
    waste,
    ingredients,
    kitchen,
  ] = await Promise.all([

    supabaseAdmin
      .from('payments')
      .select('*'),

    supabaseAdmin
      .from(
        'production_waste_logs'
      )
      .select('*'),

    supabaseAdmin
      .from('ingredients')
      .select('*'),

    supabaseAdmin
      .from('order_items')
      .select('*'),
  ])

  const recommendations = []

  const revenue =
    (payments.data || [])
      .reduce(
        (
          sum,
          payment
        ) =>
          sum +
          Number(
            payment.total || 0
          ),
        0
      )

  const wasteCost =
    (waste.data || [])
      .reduce(
        (
          sum,
          item
        ) =>
          sum +
          Number(
            item.estimated_cost || 0
          ),
        0
      )

  if (
    revenue > 0 &&
    (
      wasteCost / revenue
    ) > 0.08
  ) {

    recommendations.push({

      severity:
        'CRITICAL',

      title:
        'High Waste Detected',

      description:
        'Waste exceeds 8% of revenue. Review kitchen production and prep control.',
    })
  }

  ;(ingredients.data || [])
    .forEach(
      ingredient => {

        if (
          Number(
            ingredient.stock || 0
          ) <= Number(
            ingredient.minimum_stock || 0
          )
        ) {

          recommendations.push({

            severity:
              'WARNING',

            title:
              ingredient.name,

            description:
              'Low inventory detected. Procurement replenishment recommended.',
          })
        }
      }
    )

  const delayedKitchen =
    (kitchen.data || [])
      .filter(
        item =>
          item.kitchen_status !==
          'READY'
      )

  if (
    delayedKitchen.length >= 10
  ) {

    recommendations.push({

      severity:
        'WARNING',

      title:
        'Kitchen Load Spike',

      description:
        'Kitchen queue is overloaded. Consider labor redistribution.',
    })
  }

  return recommendations
}
