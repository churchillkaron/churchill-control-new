export default function getKitchenStation(
  category = ""
) {

  const normalized =
    category.toLowerCase();

  // ===== BAR =====
  if (
    normalized.includes(
      "cocktail"
    ) ||
    normalized.includes(
      "drink"
    ) ||
    normalized.includes(
      "beverage"
    ) ||
    normalized.includes(
      "coffee"
    )
  ) {

    return "BAR";
  }

  // ===== PIZZA =====
  if (
    normalized.includes(
      "pizza"
    )
  ) {

    return "PIZZA";
  }

  // ===== DESSERT =====
  if (
    normalized.includes(
      "dessert"
    ) ||
    normalized.includes(
      "cake"
    ) ||
    normalized.includes(
      "ice cream"
    )
  ) {

    return "DESSERT";
  }

  // ===== COLD =====
  if (
    normalized.includes(
      "salad"
    ) ||
    normalized.includes(
      "cold"
    )
  ) {

    return "COLD";
  }

  // ===== GRILL =====
  if (
    normalized.includes(
      "grill"
    ) ||
    normalized.includes(
      "steak"
    ) ||
    normalized.includes(
      "bbq"
    )
  ) {

    return "GRILL";
  }

  // ===== DEFAULT =====
  return "MAIN";
}
