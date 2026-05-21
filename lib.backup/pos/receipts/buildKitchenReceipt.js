export function buildKitchenReceipt({
  station,
  items = [],
}) {

  const lines = []

  lines.push(
    `STATION: ${station}`
  )

  lines.push(
    '----------------------'
  )

  items.forEach(item => {

    lines.push(
      `${item.quantity}x ${item.dish_name}`
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

    lines.push('')
  })

  lines.push(
    '----------------------'
  )

  return lines.join('\n')
}
