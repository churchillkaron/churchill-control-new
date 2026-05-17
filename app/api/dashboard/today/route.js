export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const base = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'

    /* CALL YOUR EXISTING APIS */
    const [
      revenueRes,
      ordersRes,
      performanceRes,
      financeRes
    ] = await Promise.all([
      fetch(`${base}/api/revenue/today`).catch(() => null),
      fetch(`${base}/api/orders/today`).catch(() => null),
      fetch(`${base}/api/performance/today`).catch(() => null),
      fetch(`${base}/api/finance/summary`).catch(() => null)
    ])

    /* SAFE PARSE */
    const revenueData = await safe(revenueRes)
    const ordersData = await safe(ordersRes)
    const performanceData = await safe(performanceRes)
    const financeData = await safe(financeRes)

    /* NORMALIZE (VERY IMPORTANT) */
    const revenue = revenueData?.total || revenueData?.revenue || 0
    const orders = ordersData?.count || ordersData?.orders || 0
    const avgOrder =
      orders > 0 ? Math.round(revenue / orders) : 0

    const serviceCharge =
      revenueData?.serviceCharge || Math.round(revenue * 0.05)

    const fohScore =
      performanceData?.fohScore ||
      performanceData?.foh_score ||
      0

    const kitchenLevel =
      performanceData?.kitchenLevel ||
      performanceData?.kitchen ||
      'GOOD'

    const barLevel =
      performanceData?.barLevel ||
      performanceData?.bar ||
      'GOOD'

    const cogs =
      financeData?.cogs ||
      financeData?.cost ||
      0

    const profit =
      financeData?.profit ||
      revenue - cogs

    const costPercent =
      revenue > 0
        ? Math.round((cogs / revenue) * 100)
        : 0

    const alerts =
      performanceData?.alerts ||
      financeData?.alerts ||
      []

    const tasks =
      performanceData?.tasks ||
      []

    const stock =
      financeData?.lowStock ||
      []

    const staff =
      performanceData?.staff ||
      []

    return NextResponse.json({
      revenue,
      orders,
      avgOrder,
      serviceCharge,

      fohScore,
      kitchenLevel,
      barLevel,

      cogs,
      profit,
      costPercent,

      alerts,
      tasks,
      stock,
      staff
    })

  } catch (err) {
    console.error('DASHBOARD ERROR:', err)

    return NextResponse.json({
      revenue: 0,
      orders: 0,
      avgOrder: 0,
      serviceCharge: 0,

      fohScore: 0,
      kitchenLevel: 'UNKNOWN',
      barLevel: 'UNKNOWN',

      cogs: 0,
      profit: 0,
      costPercent: 0,

      alerts: [],
      tasks: [],
      stock: [],
      staff: []
    })
  }
}

/* SAFE JSON PARSER */
async function safe(res) {
  try {
    if (!res || !res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}