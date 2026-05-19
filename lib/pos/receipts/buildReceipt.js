export function buildReceipt({
  business = {},
  order = {},
  items = [],
  totals = {},
}) {

  const lines = []

  lines.push(
    business.name ||
    'CHURCHILL'
  )

  lines.push(
    business.address || ''
  )

  lines.push(
    '----------------------'
  )

  lines.push(
    `Order: ${
      order.order_number || ''
    }`
  )

  lines.push(
    `Table: ${
      order.table_name || ''
    }`
  )

  lines.push(
    `Date: ${
      new Date()
        .toLocaleString()
    }`
  )

  lines.push(
    '----------------------'
  )

  items.forEach(item => {

    lines.push(
      `${item.quantity}x ${item.dish_name}`
    )

    lines.push(
      `฿${item.total}`
    )

    if (
      item.modifiers?.length
    ) {

      item.modifiers.forEach(
        modifier => {

          lines.push(
            `  • ${modifier.name}`
          )
        }
      )
    }
  })

  lines.push(
    '----------------------'
  )

  lines.push(
    `Subtotal: ฿${totals.subtotal || 0}`
  )

  lines.push(
    `Tax: ฿${totals.tax || 0}`
  )

  lines.push(
    `Service: ฿${totals.service_charge || 0}`
  )

  lines.push(
    `Discount: ฿${totals.discount || 0}`
  )

  lines.push(
    `TOTAL: ฿${totals.total || 0}`
  )

  lines.push(
    '----------------------'
  )

  lines.push(
    'Thank you'
  )

  return lines.join('\n')
}
