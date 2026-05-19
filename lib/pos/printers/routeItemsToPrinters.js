export function routeItemsToPrinters(
  items = [],
  printers = []
) {

  const routes = {}

  items.forEach(item => {

    const station =
      item.station ||
      'KITCHEN'

    const stationPrinters =
      printers.filter(
        printer =>
          printer.station ===
          station
      )

    routes[station] = {
      printers:
        stationPrinters,
      items:
        routes[station]
          ?.items || [],
    }

    routes[station]
      .items
      .push(item)

  })

  return routes
}
