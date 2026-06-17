/**
 * AVANTIQO NAV GUARD LAYER
 * Handles tenant + permissions filtering
 */

export function filterWorkspaceNav(nav, context = {}) {
  const { role = "staff", permissions = [], tenantId } = context;

  if (!nav || typeof nav !== "object") return {};

  const filtered = {};

  for (const [layer, items] of Object.entries(nav)) {
    if (!Array.isArray(items)) continue;

    const allowedItems = items.filter((item) => {
      // BASIC RULE: always allow for now (safe default)
      // later we plug permissions here

      if (!item) return false;

      return true;
    });

    if (allowedItems.length > 0) {
      filtered[layer] = allowedItems;
    }
  }

  return filtered;
}
