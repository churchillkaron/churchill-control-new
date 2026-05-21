export function routeOrderItems(
  items = []
) {

  const stations = {}

  items.forEach(item => {

    const station =
      item.station ||
      'KITCHEN'

    if (
      !stations[station]
    ) {

      stations[station] = []
    }

    stations[station].push({
      dish_id:
        item.dish_id,

      dish_name:
        item.dish_name,

      quantity:
        item.quantity,

      modifiers:
        item.modifiers || [],

      priority:
        item.priority ||
        'NORMAL',
    })
  })

  return stations
}
