export function routeKitchenStation(
  item
) {

  const name =
    (
      item.item_name ||
      item.name ||
      ""
    )
      .toLowerCase();

  // ===== BAR =====
  if (
    name.includes("wine") ||
    name.includes("cocktail") ||
    name.includes("beer") ||
    name.includes("coffee") ||
    name.includes("tea") ||
    name.includes("juice")
  ) {

    return "BAR";
  }

  // ===== DESSERT =====
  if (
    name.includes("cake") ||
    name.includes("dessert") ||
    name.includes("ice cream")
  ) {

    return "DESSERT";
  }

  // ===== COLD =====
  if (
    name.includes("salad") ||
    name.includes("oyster") ||
    name.includes("ceviche")
  ) {

    return "COLD";
  }

  // ===== DEFAULT =====
  return "GRILL";
}
