export function routeKitchenStation(
  item
) {

  const category =
    item.category
      ?.toLowerCase();

  const name =
    item.name
      ?.toLowerCase();

  // ===== DESSERT =====
  if (
    category === "dessert"
  ) {

    return "DESSERT";
  }

  // ===== BAR =====
  if (
    category === "drink" ||
    category === "beverage"
  ) {

    return "BAR";
  }

  // ===== COLD =====
  if (
    name?.includes(
      "salad"
    ) ||
    name?.includes(
      "sashimi"
    )
  ) {

    return "COLD";
  }

  // ===== GRILL =====
  if (
    name?.includes(
      "steak"
    ) ||
    name?.includes(
      "burger"
    ) ||
    name?.includes(
      "grill"
    )
  ) {

    return "GRILL";
  }

  // ===== DEFAULT =====
  return "MAIN";
}
