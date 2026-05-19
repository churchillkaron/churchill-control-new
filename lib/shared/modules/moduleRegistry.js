export const MODULES = {
  restaurant: {
    key: 'restaurant',
    name: 'Restaurant',
    status: 'active',
    dependsOn: ['finance', 'inventory', 'production', 'payroll'],
  },

  finance: {
    key: 'finance',
    name: 'Finance',
    status: 'active',
    dependsOn: [],
  },

  production: {
    key: 'production',
    name: 'Production',
    status: 'active',
    dependsOn: ['inventory', 'finance'],
  },

  inventory: {
    key: 'inventory',
    name: 'Inventory',
    status: 'active',
    dependsOn: ['finance'],
  },

  payroll: {
    key: 'payroll',
    name: 'Payroll',
    status: 'active',
    dependsOn: ['finance'],
  },

  marketing: {
    key: 'marketing',
    name: 'Marketing',
    status: 'active',
    dependsOn: [],
  },

  hotel: {
    key: 'hotel',
    name: 'Hotel',
    status: 'planned',
    dependsOn: ['finance', 'payroll'],
  },

  retail: {
    key: 'retail',
    name: 'Retail',
    status: 'planned',
    dependsOn: ['finance', 'inventory'],
  },

  construction: {
    key: 'construction',
    name: 'Construction',
    status: 'planned',
    dependsOn: ['finance', 'procurement'],
  },
}

export function getModule(key) {
  return MODULES[key] || null
}

export function getActiveModules() {
  return Object.values(MODULES).filter(module => module.status === 'active')
}

export function getPlannedModules() {
  return Object.values(MODULES).filter(module => module.status === 'planned')
}
