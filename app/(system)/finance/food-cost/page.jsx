"use client";

export const dynamic = "force-dynamic";

import {
  useEffect,
  useState,
} from 'react'

import PageWrapper from '@/components/PageWrapper'

import { supabase } from '@/lib/shared/supabase/client'

import {
  useOrganizationRuntime,
} from '@/lib/hooks/useOrganizationRuntime'

export default function FoodCostPage() {

  const {
    tenantId,
    organization,
  } = useOrganizationRuntime()

  const [
    sales,
    setSales,
  ] = useState([])

  const [
    totals,
    setTotals,
  ] = useState({

    revenue: 0,

    cost: 0,

    profit: 0,

    foodCost: 0,
  })

  useEffect(() => {

    loadData()

  }, [tenantId])

  async function loadData() {

    if (!tenantId) {
      return
    }

    const {
      data,
    } = await supabase
      .from(
        'daily_sales_items'
      )
      .select('*')
      .eq(
        'tenant_id',
        tenantId
      )
      .order(
        'created_at',
        {
          ascending: false,
        }
      )

    const rows =
      data || []

    let revenue = 0
    let cost = 0

    rows.forEach(row => {

      revenue +=
        Number(
          row.revenue || 0
        )

      cost +=
        Number(
          row.cost || 0
        )
    })

    const profit =
      revenue - cost

    const foodCost =
      revenue > 0
        ? (
            (cost / revenue) *
            100
          ).toFixed(1)
        : 0

    setSales(rows)

    setTotals({

      revenue,

      cost,

      profit,

      foodCost,
    })
  }

  return (

    <PageWrapper
      title="Food Cost Analytics"
      subtitle="Live profitability and production finance"
    >

      <div className="p-6 text-white">

        <div className="grid grid-cols-4 gap-6 mb-6">

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">

            <div className="text-sm text-zinc-500 mb-2">
              Revenue
            </div>

            <div className="text-4xl font-light">
              ฿
              {totals.revenue.toFixed(2)}
            </div>

          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">

            <div className="text-sm text-zinc-500 mb-2">
              Production Cost
            </div>

            <div className="text-4xl font-light text-red-400">
              ฿
              {totals.cost.toFixed(2)}
            </div>

          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">

            <div className="text-sm text-zinc-500 mb-2">
              Gross Profit
            </div>

            <div className="text-4xl font-light text-emerald-400">
              ฿
              {totals.profit.toFixed(2)}
            </div>

          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">

            <div className="text-sm text-zinc-500 mb-2">
              Food Cost %
            </div>

            <div className={`text-4xl font-light ${
              Number(
                totals.foodCost
              ) > 40
                ? 'text-red-400'
                : Number(
                    totals.foodCost
                  ) > 30
                ? 'text-yellow-400'
                : 'text-emerald-400'
            }`}>

              {totals.foodCost}%

            </div>

          </div>

        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">

          <div className="text-2xl font-semibold mb-6">
            Production Transactions
          </div>

          <div className="space-y-4">

            {sales.map(
              sale => (

                <div
                  key={sale.id}
                  className="bg-black border border-zinc-800 rounded-2xl p-5 flex items-center justify-between"
                >

                  <div>

                    <div className="text-xl">
                      {
                        sale.item_name
                      }
                    </div>

                    <div className="text-sm text-zinc-500 mt-1">
                      Qty:
                      {' '}
                      {
                        sale.quantity
                      }
                    </div>

                  </div>

                  <div className="text-right">

                    <div className="text-lg text-white">
                      Revenue:
                      {' '}
                      ฿
                      {
                        Number(
                          sale.revenue || 0
                        ).toFixed(2)
                      }
                    </div>

                    <div className="text-lg text-red-400">
                      Cost:
                      {' '}
                      ฿
                      {
                        Number(
                          sale.cost || 0
                        ).toFixed(2)
                      }
                    </div>

                    <div className="text-lg text-emerald-400">
                      Profit:
                      {' '}
                      ฿
                      {(
                        Number(
                          sale.revenue || 0
                        ) -
                        Number(
                          sale.cost || 0
                        )
                      ).toFixed(2)}
                    </div>

                  </div>

                </div>

              )
            )}

          </div>

        </div>

      </div>

    </PageWrapper>
  )
}
