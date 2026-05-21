export function buildCustomerDisplay({
  order = {},
  items = [],
  totals = {},
}) {

  return {
    table:
      order.table_name ||
      'N/A',

    order_number:
      order.order_number ||
      'N/A',

    items:
      items.map(item => ({
        name:
          item.dish_name,
        quantity:
          item.quantity,
        total:
          item.total,
      })),

    subtotal:
      totals.subtotal || 0,

    tax:
      totals.tax || 0,

    service_charge:
      totals.service_charge || 0,

    discount:
      totals.discount || 0,

    total:
      totals.total || 0,
  }
}
