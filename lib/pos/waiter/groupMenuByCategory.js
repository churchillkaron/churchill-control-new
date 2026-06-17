export function groupMenuByCategory(dishes = []) {
  const grouped = {};

  for (const dish of dishes) {
    const cat = dish.category || "Other";

    if (!grouped[cat]) {
      grouped[cat] = [];
    }

    grouped[cat].push(dish);
  }

  return grouped;
}
