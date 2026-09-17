export const PUBLIC_PRODUCT_STATUS = {
  available: { label: "Available", description: "Ready to adopt as a product today." },
  early_access: { label: "Early Access", description: "Substantial product path exists and is being completed with selected users." },
  coming_soon: { label: "Coming Soon", description: "Catalogued now and moving toward a complete sellable product." },
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
