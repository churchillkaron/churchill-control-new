export async function getSystemModules() {

  return [

    {
      name:
        'POS',
      status:
        'ONLINE',
      description:
        'Orders, payments, tables, receipts, shifts',
    },

    {
      name:
        'Kitchen',
      status:
        'ONLINE',
      description:
        'Kitchen queue, SLA, preparation flow',
    },

    {
      name:
        'Production',
      status:
        'ONLINE',
      description:
        'Recipes, costing, inventory deduction',
    },

    {
      name:
        'Procurement',
      status:
        'ONLINE',
      description:
        'Purchase orders, suppliers, invoices',
    },

    {
      name:
        'Finance',
      status:
        'ONLINE',
      description:
        'GL, AP, P&L, tax, consolidation',
    },

    {
      name:
        'Accounting',
      status:
        'ONLINE',
      description:
        'Periods, audit, approvals, compliance',
    },

    {
      name:
        'Performance',
      status:
        'ONLINE',
      description:
        'Revenue, waste, operational efficiency',
    },

    {
      name:
        'AI Operations',
      status:
        'ONLINE',
      description:
        'Predictive operational intelligence',
    },

    {
      name:
        'Security',
      status:
        'ONLINE',
      description:
        'Permissions, audit logs, governance',
    },
  ]
}
