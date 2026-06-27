/**
 * GLOBAL FINANCE CONSOLIDATION ENGINE
 * Multi-entity + multi-company aggregation layer
 */

export function consolidateEntities({ entities = [] }) {
  let totalRevenue = 0;
  let totalExpense = 0;

  for (const e of entities) {
    totalRevenue += e.revenue || 0;
    totalExpense += e.expense || 0;
  }

  return {
    totalRevenue,
    totalExpense,
    netGroupProfit: totalRevenue - totalExpense,
    entityCount: entities.length
  };
}
