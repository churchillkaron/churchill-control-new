// 🔥 MENU PERFORMANCE MEMORY

export function updateMenuStats(orderItems) {
  const stats = JSON.parse(localStorage.getItem("menu_stats") || "{}");

  orderItems.forEach((item) => {
    if (!stats[item.name]) {
      stats[item.name] = {
        count: 0,
        revenue: 0,
      };
    }

    stats[item.name].count += 1;
    stats[item.name].revenue += item.price;
  });

  localStorage.setItem("menu_stats", JSON.stringify(stats));
}

export function getMenuStats() {
  return JSON.parse(localStorage.getItem("menu_stats") || "{}");
}