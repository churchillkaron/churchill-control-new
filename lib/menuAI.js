// 🔥 MENU AI ENGINE

export function analyzeMenu() {
  const stats = JSON.parse(localStorage.getItem("menu_stats") || "{}");

  let best = null;
  let worst = null;

  Object.entries(stats).forEach(([name, data]) => {
    if (!best || data.revenue > best.revenue) {
      best = { name, ...data };
    }

    if (!worst || data.revenue < worst.revenue) {
      worst = { name, ...data };
    }
  });

  if (best) {
    localStorage.setItem("ai_best_item", best.name);
  }

  if (worst && worst.count > 3) {
    localStorage.setItem("ai_weak_item", worst.name);
  }
}

export function getBestItem() {
  return localStorage.getItem("ai_best_item");
}

export function getWeakItem() {
  return localStorage.getItem("ai_weak_item");
}