export function groupSplitPayments(
  items = [],
  guestCount = 1
) {

  const groups =
    Array.from(
      {
        length: guestCount,
      },
      () => []
    )

  items.forEach(
    (
      item,
      index
    ) => {

      const target =
        index %
        guestCount

      groups[target].push(
        item
      )

    }
  )

  return groups
}
