"use client";

export const dynamic = "force-dynamic";

import {
  useEffect,
  useState,
} from 'react'

import PageWrapper from '@/components/PageWrapper'

import { supabase } from '@/lib/shared/supabase/client'

export default function DishesPage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null)

  const [
    dishes,
    setDishes,
  ] = useState([])

  const [
    loading,
    setLoading,
  ] = useState(false)

  const [
    form,
    setForm,
  ] = useState({
    name: '',
    price: '',
    category: 'main',
  })

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

    loadDishes()

  }, [tenantId])

  async function loadDishes() {

    if (!tenantId) {
      return
    }

    const response =
      await fetch(
        `/api/dishes?tenant_id=${tenantId}`
      )

    const result =
      await response.json()

    setDishes(
      result.data || []
    )
  }

  async function createDish() {

    try {

      setLoading(true)

      const response =
        await fetch(
          '/api/dishes',
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
            },
            body: JSON.stringify({
              ...form,
              tenant_id:
                tenantId,
            }),
          }
        )

      const result =
        await response.json()

      if (
        !result.success
      ) {

        alert(
          result.error
        )

        return
      }

      setForm({
        name: '',
        price: '',
        category:
          'main',
      })

      await loadDishes()

    } catch (error) {

      console.error(error)

      alert('Failed')

    } finally {

      setLoading(false)
    }
  }

  return (

    <PageWrapper
      title="Dish Setup"
      subtitle="POS menu management"
    >

      <div className="p-6 text-white">

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 mb-6">

          <h2 className="text-2xl font-semibold mb-6">
            Create Dish
          </h2>

          <div className="grid grid-cols-3 gap-4">

            <input
              value={form.name}
              onChange={(e) =>
                setForm({
                  ...form,
                  name:
                    e.target.value,
                })
              }
              placeholder="Dish Name"
              className="bg-black border border-zinc-700 rounded-2xl p-4"
            />

            <input
              type="number"
              value={form.price}
              onChange={(e) =>
                setForm({
                  ...form,
                  price:
                    e.target.value,
                })
              }
              placeholder="Price"
              className="bg-black border border-zinc-700 rounded-2xl p-4"
            />

            <select
              value={
                form.category
              }
              onChange={(e) =>
                setForm({
                  ...form,
                  category:
                    e.target.value,
                })
              }
              className="bg-black border border-zinc-700 rounded-2xl p-4"
            >

              <option value="starter">
                Starter
              </option>

              <option value="main">
                Main
              </option>

              <option value="dessert">
                Dessert
              </option>

            </select>

          </div>

          <button
            onClick={
              createDish
            }
            disabled={loading}
            className="mt-6 bg-violet-500 px-6 py-4 rounded-2xl"
          >

            {loading
              ? 'Creating...'
              : 'Create Dish'}

          </button>

        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">

          <h2 className="text-2xl font-semibold mb-6">
            Dishes
          </h2>

          <div className="space-y-4">

            {dishes.map(
              dish => (

                <div
                  key={dish.id}
                  className="flex items-center justify-between bg-black border border-zinc-800 rounded-2xl p-4"
                >

                  <div>

                    <div className="text-lg">
                      {dish.name}
                    </div>

                    <div className="text-sm text-zinc-500">
                      {
                        dish.category
                      }
                    </div>

                  </div>

                  <div className="text-right">

                    <div className="text-lg">
                      ฿
                      {dish.price}
                    </div>

                    <div className="text-sm text-zinc-500">
                      Cost:
                      {' '}
                      ฿
                      {dish.cost}
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
