import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function getSystemAlerts() {

  const [
    ingredients,
    kitchen,
    payables,
    tables,
  ] = await Promise.all([

    supabaseAdmin
      .from('ingredients')
      .select('*'),

    supabaseAdmin
      .from('order_items')
      .select('*'),

    supabaseAdmin
      .from(
        'finance_accounts_payable'
      )
      .select('*'),

    supabaseAdmin
      .from(
        'restaurant_tables'
      )
      .select('*'),
  ])

  const alerts = []

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

          alerts.push({

            type:
              'LOW_STOCK',

            severity:
              'CRITICAL',

            title:
              ingredient.name,

            description:
              `Stock is low (${ingredient.stock})`,
          })
        }
      }
    )

  ;(kitchen.data || [])
    .forEach(
      item => {

        if (
          item.kitchen_status !==
          'READY'
        ) {

          alerts.push({

            type:
              'KITCHEN_DELAY',

            severity:
              'WARNING',

            title:
              item.dish_name,

            description:
              `Kitchen item pending (${item.kitchen_status})`,
          })
        }
      }
    )

  ;(payables.data || [])
    .forEach(
      payable => {

        if (
          payable.status !==
          'PAID'
        ) {

          alerts.push({

            type:
              'UNPAID_AP',

            severity:
              'WARNING',

            title:
              payable.supplier_name,

            description:
              `Outstanding AP ฿${payable.amount}`,
          })
        }
      }
    )

  ;(tables.data || [])
    .forEach(
      table => {

        if (
          table.status ===
          'OCCUPIED'
        ) {

          alerts.push({

            type:
              'ACTIVE_TABLE',

            severity:
              'INFO',

            title:
              table.table_name,

            description:
              'Currently occupied',
          })
        }
      }
    )

  return alerts
}
