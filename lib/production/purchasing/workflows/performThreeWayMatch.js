export function performThreeWayMatch({
  purchase_order = {},
  received_items = [],
  invoice_items = [],
}) {

  const results = []

  invoice_items.forEach(
    invoice => {

      const received =
        received_items.find(
          item =>
            item.ingredient_id ===
            invoice.ingredient_id
        )

      const quantityMatched =
        Number(
          received?.quantity || 0
        ) ===
        Number(
          invoice.quantity || 0
        )

      const priceMatched =
        Number(
          invoice.unit_price || 0
        ) ===
        Number(
          invoice.expected_price || 0
        )

      results.push({

        ingredient_id:
          invoice.ingredient_id,

        quantityMatched,

        priceMatched,

        status:
          quantityMatched &&
          priceMatched
            ? 'MATCHED'
            : 'MISMATCH',
      })
    }
  )

  const approved =
    results.every(
      item =>
        item.status ===
        'MATCHED'
    )

  return {

    purchase_order_id:
      purchase_order.id,

    approved,

    results,
  }
}
