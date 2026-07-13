"use client";

export const dynamic = "force-dynamic";

import {
  useEffect,
  useState,
} from 'react'

import PageWrapper from '@/components/PageWrapper'

import { supabase } from '@/lib/shared/supabase/client'

export default function InventoryLedgerPage() {

  const [
    organizationId,
    setOrganizationId,
  ] = useState(null)

  const [
    movements,
    setMovements,
  ] = useState([])

  const [
    ingredients,
    setIngredients,
  ] = useState([])

  useEffect(() => {

    async function loadOrganization() {

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
        data?.organization_id
      ) {

        setOrganizationId(
          data.organization_id
        )
      }
    }

    loadOrganization()

  }, [])

  useEffect(() => {

    loadData()

  }, [organizationId])

  async function loadData() {

    if (!organizationId) {
      return
    }

    const {
      data: ingredientData,
    } = await supabase
      .from('ingredients')
      .select('*')
      .eq(
        'organization_id',
        organizationId
      )
      .order('name')

    const {
      data: movementData,
    } = await supabase
      .from(
        'inventory_movements'
      )
      .select('*')
      .eq(
        'organization_id',
        organizationId
      )
      .order(
        'created_at',
        {
          ascending: false,
        }
      )

    setIngredients(
      ingredientData || []
    )

    setMovements(
      movementData || []
    )
  }

  function getIngredientName(
    id
  ) {

    const ingredient =
      ingredients.find(
        i => i.id === id
      )

    return ingredient
      ? ingredient.name
      : 'Unknown'
  }

  return (

    <PageWrapper
      title="Inventory Ledger"
      subtitle="Live ingredient movement tracking"
    >

      <div className="p-6 text-white">

        <div className="grid grid-cols-4 gap-4 mb-6">

          {ingredients.map(
            ingredient => (

              <div
                key={ingredient.id}
                className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5"
              >

                <div className="text-sm text-zinc-500 mb-2">
                  Ingredient
                </div>

                <div className="text-xl font-semibold">
                  {
                    ingredient.name
                  }
                </div>

                <div className="mt-4 text-3xl font-light">
                  {
                    ingredient.quantity
                  }
                </div>

                <div className="text-sm text-zinc-500 mt-1">
                  {
                    ingredient.unit
                  }
                </div>

              </div>

            )
          )}

        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">

          <div className="text-2xl font-semibold mb-6">
            Inventory Movements
          </div>

          <div className="space-y-4">

            {movements.map(
              movement => (

                <div
                  key={movement.id}
                  className="bg-black border border-zinc-800 rounded-2xl p-4 flex items-center justify-between"
                >

                  <div>

                    <div className="text-lg">
                      {getIngredientName(
                        movement.ingredient_id
                      )}
                    </div>

                    <div className="text-sm text-zinc-500 mt-1">
                      {
                        movement.notes
                      }
                    </div>

                  </div>

                  <div className="text-right">

                    <div className={`text-xl ${
                      movement.type === 'usage'
                        ? 'text-red-400'
                        : 'text-emerald-400'
                    }`}>

                      {movement.type === 'usage'
                        ? '-'
                        : '+'}

                      {
                        movement.quantity
                      }

                    </div>

                    <div className="text-sm text-zinc-500 mt-1">
                      {
                        movement.type
                      }
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
