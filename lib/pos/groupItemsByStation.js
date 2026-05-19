export function groupItemsByStation(
  items = []
) {

  return items.reduce(
    (
      stations,
      item
    ) => {

      const station =
        item.station ||
        'KITCHEN'

      if (
        !stations[station]
      ) {
        stations[station] = []
      }

      stations[station].push(
        item
      )

      return stations

    },
    {}
  )
}
