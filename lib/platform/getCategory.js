import { CATEGORY_GROUPS } from "./categories";

export function getCategoryByModule(moduleKey) {
  for (const [category, modules] of Object.entries(CATEGORY_GROUPS)) {
    if (modules.includes(moduleKey)) {
      return category;
    }
  }
  return "platform";
}
