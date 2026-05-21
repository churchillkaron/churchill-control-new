export async function syncOfflineOrders() {

  const orders =
    JSON.parse(
      localStorage.getItem(
        'offline_orders'
      ) || '[]'
    )

  if (!orders.length) {
    return
  }

  const response =
    await fetch(
      '/api/pos/offline/sync',
      {
        method: 'POST',

        headers: {
          'Content-Type':
            'application/json',
        },

        body: JSON.stringify({
          orders,
        }),
      }
    )

  const result =
    await response.json()

  if (result.success) {

    localStorage.removeItem(
      'offline_orders'
    )
  }

  return result
}
