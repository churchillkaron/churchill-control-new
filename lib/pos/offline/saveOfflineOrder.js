export function saveOfflineOrder(
  order
) {

  const existing =
    JSON.parse(
      localStorage.getItem(
        'offline_orders'
      ) || '[]'
    )

  existing.push(order)

  localStorage.setItem(
    'offline_orders',
    JSON.stringify(existing)
  )
}
