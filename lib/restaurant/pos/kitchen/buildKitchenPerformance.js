export function buildKitchenPerformance(
  items = []
) {

  const completed =
    items.filter(
      item =>
        item.status ===
        'COMPLETED'
    ).length

  const delayed =
    items.filter(
      item =>
        item.status ===
        'DELAYED'
    ).length

  const total =
    items.length

  const efficiency =
    total > 0
      ? (
          completed /
          total
        ) * 100
      : 0

  return {
    completed,
    delayed,
    total,
    efficiency:
      Number(
        efficiency.toFixed(2)
      ),
  }
}
