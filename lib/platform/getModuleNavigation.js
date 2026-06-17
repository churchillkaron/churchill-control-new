import { MODULE_CATEGORIES } from "./moduleCategories";

export function getModuleNavigation(modules = []) {
  const nav = {};

  for (const [category, items] of Object.entries(MODULE_CATEGORIES)) {
    nav[category] = modules.filter(m =>
      items.includes(m.key || m)
    );
  }

  return nav;
}
