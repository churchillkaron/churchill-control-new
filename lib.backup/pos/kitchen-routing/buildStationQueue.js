export function buildStationQueue(
  routedStations = {}
) {

  return Object.entries(
    routedStations
  ).map(
    ([
      station,
      items,
    ]) => ({

      station,

      totalItems:
        items.length,

      urgentItems:
        items.filter(
          item =>
            item.priority ===
            'URGENT'
        ).length,

      items,
    })
  )
}
