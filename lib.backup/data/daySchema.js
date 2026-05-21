export function createDayRecord(data) {
  return {
    id: `${data.date}-${Date.now()}`,

    // ✅ FORCE consistent date format
    date: new Date(data.date).toISOString().split("T")[0],

    revenue: data.revenue || 0,
    totalOrders: data.totalOrders || 0,
    avgOrderValue: data.avgOrderValue || 0,

    serviceCharge: data.serviceCharge || 0,

    // ✅ STABILIZED STRUCTURE
    payouts: {
      total: data.payouts?.total || 0,
      staffBreakdown: data.payouts?.staffBreakdown || []
    },

    staff: data.staff || [],

    // ✅ KEEP YOUR CURRENT LOGIC (no rename)
    departmentLevels: {
      FOH: data.departmentLevels?.FOH || "UNKNOWN",
      BAR: data.departmentLevels?.BAR || "UNKNOWN",
      KITCHEN: data.departmentLevels?.KITCHEN || "UNKNOWN"
    },

    createdAt: new Date().toISOString()
  }
}