'use client'

import {
  useEffect,
  useState,
} from 'react'

import PageWrapper from '@/components/PageWrapper'

import { supabase } from '@/lib/shared/supabase/client'

export default function LiveOperationsPage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null)

  const [
    activeTables,
    setActiveTables,
  ] = useState([])

  const [
    kitchenTickets,
    setKitchenTickets,
  ] = useState([])

  const [
    stats,
    setStats,
  ] = useState({

    revenue: 0,

    orders: 0,

    active: 0,

    kitchenPending: 0,
  })

  useEffect(() => {

    async function loadTenant() {

      const {
        data: { user },
      } =
        await supabase.auth.getUser()

      if (!user) return

      const {
        data,
      } = await supabase
        .from(
          'staff_accounts'
        )
        .select('*')
        .eq(
          'auth_user_id',
          user.id
        )
        .single()

      if (
        data?.tenant_id
      ) {

        setTenantId(
          data.tenant_id
        )
      }
    }

    loadTenant()

  }, [])

  useEffect(() => {

    if (!tenantId) {
      return
    }

    loadData()

    const interval =
      setInterval(
        loadData,
        5000
      )

    return () =>
      clearInterval(
        interval
      )

  }, [tenantId])

  async function loadData() {

    const {
      data: tables,
    } = await supabase
      .from(
        'table_sessions'
      )
      .select('*')
      .eq(
        'tenant_id',
        tenantId
      )
      .eq(
        'status',
        'ACTIVE'
      )

    const {
      data: kitchen,
    } = await supabase
      .from(
        'kitchen_tickets'
      )
      .select('*')
      .eq(
        'tenant_id',
        tenantId
      )
      .neq(
        'status',
        'COMPLETED'
      )

    const active =
      tables || []

    const tickets =
      kitchen || []

    let revenue = 0
    let orders = 0

    active.forEach(
      table => {

        revenue +=
          Number(
            table.revenue || 0
          )

        orders +=
          Number(
            table.orders || 0
          )
      }
    )

    setActiveTables(
      active
    )

    setKitchenTickets(
      tickets
    )

    setStats({

      revenue,

      orders,

      active:
        active.length,

      kitchenPending:
        tickets.length,
    })
  }

  return (

    <PageWrapper
      title="Live Operations"
      subtitle="Restaurant control center"
    >

      <div className="p-6 text-white">

        <div className="grid grid-cols-4 gap-4 mb-6">

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">

            <div className="text-sm text-zinc-500 mb-2">
              Live Revenue
            </div>

            <div className="text-4xl font-light">
              ฿
              {
                stats.revenue.toFixed(0)
              }
            </div>

          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">

            <div className="text-sm text-zinc-500 mb-2">
              Orders
            </div>

            <div className="text-4xl font-light">
              {
                stats.orders
              }
            </div>

          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">

            <div className="text-sm text-zinc-500 mb-2">
              Active Tables
            </div>

            <div className="text-4xl font-light text-emerald-400">
              {
                stats.active
              }
            </div>

          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">

            <div className="text-sm text-zinc-500 mb-2">
              Kitchen Queue
            </div>

            <div className="text-4xl font-light text-yellow-400">
              {
                stats.kitchenPending
              }
            </div>

          </div>

        </div>

        <div className="grid grid-cols-2 gap-6">

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">

            <div className="text-2xl font-semibold mb-6">
              Active Tables
            </div>

            <div className="space-y-4">

              {activeTables.map(
                table => (

                  <div
                    key={table.id}
                    className="bg-black border border-zinc-800 rounded-2xl p-5 flex items-center justify-between"
                  >

                    <div>

                      <div className="text-2xl">
                        {
                          table.table_number
                        }
                      </div>

                      <div className="text-sm text-zinc-500 mt-1">
                        Orders:
                        {' '}
                        {
                          table.orders
                        }
                      </div>

                    </div>

                    <div className="text-right">

                      <div className="text-2xl font-light">
                        ฿
                        {
                          table.revenue
                        }
                      </div>

                      <div className="text-sm text-emerald-400 mt-1">
                        ACTIVE
                      </div>

                    </div>

                  </div>

                )
              )}

            </div>

          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">

            <div className="text-2xl font-semibold mb-6">
              Kitchen Queue
            </div>

            <div className="space-y-4">

              {kitchenTickets.map(
                ticket => (

                  <div
                    key={ticket.id}
                    className="bg-black border border-zinc-800 rounded-2xl p-5 flex items-center justify-between"
                  >

                    <div>

                      <div className="text-2xl">
                        Table
                        {' '}
                        {
                          ticket.table_number
                        }
                      </div>

                      <div className="text-sm text-zinc-500 mt-1">
                        {
                          ticket.status
                        }
                      </div>

                    </div>

                    <div className={`text-sm font-semibold ${
                      ticket.status === 'PENDING'
                        ? 'text-yellow-400'
                        : 'text-emerald-400'
                    }`}>

                      {
                        ticket.status
                      }

                    </div>

                  </div>

                )
              )}

            </div>

          </div>

        </div>

      </div>

    </PageWrapper>
  )
}
