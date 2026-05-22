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
            member.id &&

            order.status ===
            "CLOSED" &&

            order.payment_status ===
            "PAID"
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

      const voidedOrders =
        memberOrders.filter(
          order =>

            [
              "VOIDED",
              "REFUNDED",
            ].includes(
              order.payment_status
            )
        )

      const voidPenalty =
        voidedOrders.length * 500

      const adjustedRevenue =
        Math.max(
          0,
          revenue -
          voidPenalty
        )

      const totalOrders =
        memberOrders.length

      const averageOrderValue =
        totalOrders > 0
          ? adjustedRevenue /
            totalOrders
          : 0

      let level =
        'GOOD'

      let multiplier =
        1;

      if (
        adjustedRevenue < 5000
      ) {

        level =
          'WARNING';

        multiplier =
          0.7;

      }

      if (
        adjustedRevenue < 3000
      ) {

        level =
          'BAD';

        multiplier =
          0.4;

      }

      if (
        adjustedRevenue < 1000
      ) {

        level =
          'CRITICAL';

        multiplier =
          0.2;

      }

      return {
        staff_id:
          member.id,

        name:
          member.name,

        revenue:
          Number(adjustedRevenue.toFixed(2)),

        raw_revenue:
          Number(
            revenue.toFixed(2)
          ),

        totalOrders,

        averageOrderValue:
          Number(
            averageOrderValue.toFixed(2)
          ),

        level,

        multiplier,

        payout_percentage:
          multiplier * 100,

      }
    }
  )
}
