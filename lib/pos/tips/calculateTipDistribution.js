export function calculateTipDistribution({
  totalTips = 0,
  staff = [],
}) {

  if (!staff.length) {

    return []
  }

  const totalWeight =
    staff.reduce(
      (
        sum,
        member
      ) =>
        sum +
        Number(
          member.weight || 1
        ),
      0
    )

  return staff.map(
    member => {

      const share =
        (
          Number(
            member.weight || 1
          ) / totalWeight
        ) * Number(totalTips)

      return {
        staff_id:
          member.staff_id,
        name:
          member.name,
        amount:
          Number(
            share.toFixed(2)
          ),
      }
    }
  )
}
