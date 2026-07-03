export function buildKitchenTicket(
  items = []
) {

  return items
    .map(item => {

      const configurations =
        (
          item.transaction_configuration_selections ||
          []
        )
          .sort(
            (a,b)=>
              Number(a.sort_order||0)-
              Number(b.sort_order||0)
          )
          .map(
            selection =>
              `   • ${selection.group_name}: ${selection.option_name}`
          )
          .join('\n')

      return `
${item.quantity}x ${item.dish_name || 'Dish'}

${configurations}
      `
    })
    .join('\n----------------\n')
}
