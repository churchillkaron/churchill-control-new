export const intelligenceLayers = [
  {
    slug: 'executive',
    title: 'Executive Intelligence',
    subtitle: 'Real operational intelligence layer',
    base: 100,
  },
  {
    slug: 'financial',
    title: 'Financial Intelligence',
    subtitle: 'Revenue, cost, margin and cash control',
    base: 120,
  },
  {
    slug: 'pos',
    title: 'POS Intelligence',
    subtitle: 'Sales, orders, tables and service flow',
    base: 130,
  },
  {
    slug: 'production',
    title: 'Production Intelligence',
    subtitle: 'Recipes, inventory, stock and food cost',
    base: 140,
  },
  {
    slug: 'ultimate',
    title: 'Ultimate Intelligence',
    subtitle: 'Full system overview for Avantiqo connection',
    base: 160,
  },
]

export function getIntelligenceLayer(slug) {
  return (
    intelligenceLayers.find(layer => layer.slug === slug) ||
    intelligenceLayers[0]
  )
}
