export async function getEntityRanking({ organizationId, entities = [] } = {}) {
  if (!organizationId) throw new Error("organizationId required");

  return (entities || [])
    .map((entity) => {
      const revenue = Number(entity?.revenue || 0);
      const netProfit = Number(entity?.netProfit ?? entity?.net_profit ?? 0);
      return {
        organization_id: organizationId,
        entity_id: entity?.id || entity?.entity_id || null,
        entity_name: entity?.name || entity?.entity_name || "Unnamed entity",
        revenue,
        net_profit: netProfit,
        margin: revenue ? (netProfit / revenue) * 100 : 0,
      };
    })
    .sort((a, b) => b.margin - a.margin)
    .map((row, index) => ({ ...row, ranking_position: index + 1 }));
}
