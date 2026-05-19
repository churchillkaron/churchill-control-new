export function buildStaffPerformance({
  orders = [],
  staff = [],
}) {

  return staff.map(
    member => {

      const memberOrders =
        orders.filter(
          order =>
            order.staff_id ===
            member.id
        )

      const revenue =
        memberOrders.reduce(
          (
            sum,
            order
          ) =>
            sum +
            Number(
              order.total || 0
            ),
          0
        )

      const totalOrders =
        memberOrders.length

      const averageOrderValue =
        totalOrders > 0
          ? revenue /
            totalOrders
          : 0

      let level =
        'GOOD'

      if (
        revenue < 5000
      ) {
        level = 'WARNING'
      }

      if (
        revenue < 3000
      ) {
        level = 'BAD'
      }

      return {
        staff_id:
          member.id,

        name:
          member.name,

        revenue:
          Number(
            revenue.toFixed(2)
          ),

        totalOrders,

        averageOrderValue:
          Number(
            averageOrderValue.toFixed(2)
          ),

        level,
      }
    }
  )
}
