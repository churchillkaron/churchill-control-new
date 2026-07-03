export function calculateCustomerPrice({
  supplier_cost = 0,
  markup_percent = 30,
  minimum_fee = 0,
}) {
  const markup =
    supplier_cost * (markup_percent / 100);

  const customer_price =
    Math.max(
      supplier_cost + markup,
      minimum_fee
    );

  return {
    supplier_cost,
    platform_markup: customer_price - supplier_cost,
    customer_price,
  };
}
