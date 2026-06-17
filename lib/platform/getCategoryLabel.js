import { CATEGORY_LABELS } from "./categories";

export function getCategoryLabel(category) {
  return CATEGORY_LABELS[category] || "Platform";
}
