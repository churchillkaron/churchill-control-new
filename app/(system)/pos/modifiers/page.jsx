'use client'

import { useEffect, useState } from 'react'

import {
  Plus,
  Settings2,
} from 'lucide-react'

export default function POSModifiersPage() {

  const tenant_id =
    '76e2caa6-dd78-49e5-b0f5-1ff94185c2d4'

  const [
    modifiers,
    setModifiers,
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
    price: 0,
    modifier_group_id: '',
  })

  async function loadModifiers() {

    try {

      const response =
        await fetch(
          '/api/pos/modifiers/get'
        )

      const result =
        await response.json()

      if (result.success) {
        setModifiers(result.data)
      }

    } catch (error) {

      console.error(error)
    }
  }

  useEffect(() => {

    loadModifiers()

  }, [])

  async function createModifier() {

    try {

      setLoading(true)

      const response =
        await fetch(
          '/api/pos/modifiers/create',
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body: JSON.stringify({
              tenant_id,
              ...form,
            }),
          }
        )

      const result =
        await response.json()

      if (result.success) {

        setForm({
          name: '',
          price: 0,
          modifier_group_id: '',
        })

        loadModifiers()
      }

    } catch (error) {

      console.error(error)

    } finally {

      setLoading(false)
    }
  }

  return (

    <div className="min-h-screen bg-black text-white p-8">

      <div className="flex items-center justify-between mb-10">

        <div>

          <h1 className="text-6xl font-black">
            POS MODIFIERS
          </h1>

          <p className="text-zinc-500 mt-3">
            Enterprise modifier management system
          </p>

        </div>

        <div className="border border-zinc-800 rounded-3xl px-6 py-4 bg-zinc-950">

          <div className="text-sm text-zinc-500">
            Total Modifiers
          </div>

          <div className="text-4xl font-black text-cyan-400">
            {modifiers.length}
          </div>

        </div>

      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        <div className="border border-zinc-800 bg-zinc-950 rounded-3xl p-6">

          <div className="flex items-center gap-3 mb-6">

            <Plus />

            <h2 className="text-2xl font-bold">
              Create Modifier
            </h2>

          </div>

          <div className="space-y-4">

            <input
              type="text"
              placeholder="Modifier Name"
              value={form.name}
              onChange={e =>
                setForm(prev => ({
                  ...prev,
                  name: e.target.value,
                }))
              }
              className="w-full bg-black border border-zinc-800 rounded-2xl p-4"
            />

            <input
              type="number"
              placeholder="Price"
              value={form.price}
              onChange={e =>
                setForm(prev => ({
                  ...prev,
                  price: Number(e.target.value),
                }))
              }
              className="w-full bg-black border border-zinc-800 rounded-2xl p-4"
            />

            <input
              type="text"
              placeholder="Modifier Group ID"
              value={form.modifier_group_id}
              onChange={e =>
                setForm(prev => ({
                  ...prev,
                  modifier_group_id:
                    e.target.value,
                }))
              }
              className="w-full bg-black border border-zinc-800 rounded-2xl p-4"
            />

            <button
              onClick={createModifier}
              disabled={loading}
              className="w-full bg-cyan-500 hover:bg-cyan-400 transition-all rounded-2xl p-4 font-bold text-black"
            >
              {loading
                ? 'CREATING...'
                : 'CREATE MODIFIER'}
            </button>

          </div>

        </div>

        <div className="xl:col-span-2 border border-zinc-800 bg-zinc-950 rounded-3xl p-6">

          <div className="flex items-center gap-3 mb-6">

            <Settings2 />

            <h2 className="text-2xl font-bold">
              Modifier Library
            </h2>

          </div>

          <div className="space-y-4 max-h-[850px] overflow-auto">

            {modifiers.map(
              modifier => (

                <div
                  key={modifier.id}
                  className="border border-zinc-800 rounded-2xl bg-black p-5"
                >

                  <div className="flex items-center justify-between">

                    <div>

                      <div className="text-2xl font-bold">
                        {modifier.name}
                      </div>

                      <div className="text-zinc-500 text-sm mt-2">
                        Group:
                        {' '}
                        {modifier.modifier_group_id || 'N/A'}
                      </div>

                    </div>

                    <div className="text-right">

                      <div className="text-cyan-400 text-3xl font-black">
                        ฿
                        {modifier.price}
                      </div>

                    </div>

                  </div>

                </div>

              )
            )}

          </div>

        </div>

      </div>

    </div>

  )
}
