export function buildSupplierPerformance({
  purchase_orders = [],
}) {

  const suppliers = {}

  purchase_orders.forEach(
    po => {

      const supplier =
        po.supplier_name ||
        'UNKNOWN'

      if (
        !suppliers[supplier]
      ) {

        suppliers[supplier] = {

          supplier,

          total_orders: 0,

          total_spend: 0,

          received_orders: 0,

          pending_orders: 0,

          reliability_score: 0,
        }
      }

      suppliers[
        supplier
      ].total_orders += 1

      suppliers[
        supplier
      ].total_spend +=
        Number(
          po.total || 0
        )

      if (
        po.status ===
        'RECEIVED'
      ) {

        suppliers[
          supplier
        ].received_orders += 1

      } else {

        suppliers[
          supplier
        ].pending_orders += 1
      }
    }
  )

  Object.values(
    suppliers
  ).forEach(
    supplier => {

      supplier.reliability_score =
        supplier.total_orders > 0
          ? Number(
              (
                supplier.received_orders /
                supplier.total_orders
              ) * 100
            ).toFixed(2)
          : 0
    }
  )

  return Object.values(
    suppliers
  )
}
