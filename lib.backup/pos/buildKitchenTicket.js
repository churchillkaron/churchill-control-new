export function buildKitchenTicket(
  items = []
) {

  return items
    .map(item => {

      const modifiers =
        (
          item.order_item_modifiers ||
          []
        )
          .map(
            modifier =>
              `   • ${modifier.modifier_name}`
          )
          .join('\n')

      return `
${item.quantity}x ${item.dish_name || 'Dish'}

${modifiers}
      `
    })
    .join('\n----------------\n')
}
