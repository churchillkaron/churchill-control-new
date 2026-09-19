export const PUBLIC_PRODUCT_STATUS = {
  available: { label: "Available", description: "Available for customers to use today." },
  early_access: { label: "Early Access", description: "Available to selected customers while final workflows and onboarding are refined." },
  coming_soon: { label: "Coming Soon", description: "Planned for a future Avantiqo release." },
};

export function publicStatusKey(product = {}) {
  if (product.publicStatus) return product.publicStatus;
  if (product.status === "live") return "available";
  if (product.status === "in_progress") return "early_access";
  return "coming_soon";
}

export function publicStatus(product = {}) {
  return PUBLIC_PRODUCT_STATUS[publicStatusKey(product)] || PUBLIC_PRODUCT_STATUS.coming_soon;
}
