"use client";

export const dynamic = "force-dynamic";

import {
  useEffect,
  useState,
} from 'react'

import PageWrapper from '@/components/PageWrapper'

import { supabase } from '@/lib/shared/supabase/client'

export default function LowStockPage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null)

  const [
    ingredients,
    setIngredients,
  ] = useState([])

  useEffect(() => {

    async function loadTenant() {

      const {
        data: { user },
      } =
        await supabase.auth.getSession()

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

    loadData()

  }, [tenantId])

  async function loadData() {

    if (!tenantId) {
      return
    }

    const {
      data,
    } = await supabase
      .from('ingredients')
      .select('*')
      .eq(
        'tenant_id',
        tenantId
      )
      .order(
        'quantity',
        {
          ascending: true,
        }
      )

    setIngredients(
      data || []
    )
  }

  const critical =
    ingredients.filter(
      i =>
        Number(
          i.quantity || 0
        ) <= 5
    )

  const warning =
    ingredients.filter(
      i =>
        Number(
          i.quantity || 0
        ) > 5 &&
        Number(
          i.quantity || 0
        ) <= 10
    )

  return (

    <PageWrapper
      title="Low Stock Monitoring"
      subtitle="Inventory risk and replenishment"
    >

      <div className="p-6 text-white">

        <div className="grid grid-cols-2 gap-6 mb-6">

          <div className="bg-red-500/10 border border-red-500/20 rounded-3xl p-6">

            <div className="text-sm text-red-400 mb-2">
              Critical
            </div>

            <div className="text-5xl font-light">
              {
                critical.length
              }
            </div>

          </div>

          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-3xl p-6">

            <div className="text-sm text-yellow-400 mb-2">
              Warning
            </div>

            <div className="text-5xl font-light">
              {
                warning.length
              }
            </div>

          </div>

        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">

          <div className="text-2xl font-semibold mb-6">
            Inventory Status
          </div>

          <div className="space-y-4">

            {ingredients.map(
              ingredient => {

                const qty =
                  Number(
                    ingredient.quantity || 0
                  )

                let status =
                  'GOOD'

                let color =
                  'text-emerald-400'

                if (qty <= 5) {

                  status =
                    'CRITICAL'

                  color =
                    'text-red-400'

                } else if (
                  qty <= 10
                ) {

                  status =
                    'WARNING'

                  color =
                    'text-yellow-400'
                }

                return (

                  <div
                    key={ingredient.id}
                    className="bg-black border border-zinc-800 rounded-2xl p-5 flex items-center justify-between"
                  >

                    <div>

                      <div className="text-xl">
                        {
                          ingredient.name
                        }
                      </div>

                      <div className="text-sm text-zinc-500 mt-1">
                        {
                          ingredient.department
                        }
                      </div>

                    </div>

                    <div className="text-right">

                      <div className="text-3xl font-light">
                        {qty}
                      </div>

                      <div className="text-sm text-zinc-500">
                        {
                          ingredient.unit
                        }
                      </div>

                    </div>

                    <div className={`text-sm font-semibold ${color}`}>
                      {status}
                    </div>

                  </div>

                )
              }
            )}

          </div>

        </div>

      </div>

    </PageWrapper>
  )
}
