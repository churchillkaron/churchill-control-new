"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from 'react'

import {
  Plus,
  Settings2,
  Layers3,
} from 'lucide-react'

export default function ConfigurationManagerPage() {

  const organization_id =
    '76e2caa6-dd78-49e5-b0f5-1ff94185c2d4'

  const [
    configurationOptions,
    setConfigurationOptions,
  ] = useState([])

  const [
    groups,
    setGroups,
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
    configuration_group_id: '',
  })

  const [
    groupForm,
    setGroupForm,
  ] = useState({
    name: '',
    required: false,
    multi_select: false,
    max_select: 1,
  })

  async function loadConfigurationOptions() {

    const response =
      await fetch(
        '/api/restaurant/configuration/options'
      )

    const result =
      await response.json()

    if (result.success) {
      setConfigurationOptions(result.data)
    }
  }

  async function loadGroups() {

    const response =
      await fetch(
        '/api/restaurant/modifiers/groups'
      )

    const result =
      await response.json()

    if (result.success) {
      setGroups(result.data)
    }
  }

  useEffect(() => {

    loadConfigurationOptions()
    loadGroups()

  }, [])

  async function createModifier() {

    setLoading(true)

    const response =
      await fetch(
        '/api/restaurant/configuration/options/create',
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json',
          },

          body: JSON.stringify({
            organization_id,
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
        configuration_group_id: '',
      })

      loadConfigurationOptions()
    }

    setLoading(false)
  }

  async function createGroup() {

    setLoading(true)

    const response =
      await fetch(
        '/api/restaurant/modifiers/groups/create',
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json',
          },

          body: JSON.stringify({
            organization_id,
            ...groupForm,
          }),
        }
      )

    const result =
      await response.json()

    if (result.success) {

      setGroupForm({
        name: '',
        required: false,
        multi_select: false,
        max_select: 1,
      })

      loadGroups()
    }

    setLoading(false)
  }

  return (

    <div className="min-h-screen bg-black text-white p-8">

      <div className="flex items-center justify-between mb-10">

        <div>

          <h1 className="text-6xl font-black">
            CONFIGURATION MANAGER
          </h1>

          <p className="text-zinc-500 mt-3">
            Enterprise configuration architecture
          </p>

        </div>

      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        <div className="space-y-6">

          <div className="border border-zinc-800 bg-zinc-950 rounded-3xl p-6">

            <div className="flex items-center gap-3 mb-6">

              <Layers3 />

              <h2 className="text-2xl font-bold">
                Create Configuration Group
              </h2>

            </div>

            <div className="space-y-4">

              <input
                type="text"
                placeholder="Group Name"
                value={groupForm.name}
                onChange={e =>
                  setGroupForm(prev => ({
                    ...prev,
                    name: e.target.value,
                  }))
                }
                className="w-full bg-black border border-zinc-800 rounded-2xl p-4"
              />

              <div className="flex items-center justify-between">

                <span>
                  Required
                </span>

                <input
                  type="checkbox"
                  checked={groupForm.required}
                  onChange={e =>
                    setGroupForm(prev => ({
                      ...prev,
                      required:
                        e.target.checked,
                    }))
                  }
                />

              </div>

              <div className="flex items-center justify-between">

                <span>
                  Multi Select
                </span>

                <input
                  type="checkbox"
                  checked={groupForm.multi_select}
                  onChange={e =>
                    setGroupForm(prev => ({
                      ...prev,
                      multi_select:
                        e.target.checked,
                    }))
                  }
                />

              </div>

              <input
                type="number"
                placeholder="Max Select"
                value={groupForm.max_select}
                onChange={e =>
                  setGroupForm(prev => ({
                    ...prev,
                    max_select:
                      Number(
                        e.target.value
                      ),
                  }))
                }
                className="w-full bg-black border border-zinc-800 rounded-2xl p-4"
              />

              <button
                onClick={createGroup}
                className="w-full bg-pink-500 hover:bg-pink-400 transition-all rounded-2xl p-4 font-bold text-black"
              >
                CREATE CONFIGURATION GROUP
              </button>

            </div>

          </div>

          <div className="border border-zinc-800 bg-zinc-950 rounded-3xl p-6">

            <div className="flex items-center gap-3 mb-6">

              <Plus />

              <h2 className="text-2xl font-bold">
                Create Configuration
              </h2>

            </div>

            <div className="space-y-4">

              <input
                type="text"
                placeholder="Configuration Name"
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
                    price:
                      Number(
                        e.target.value
                      ),
                  }))
                }
                className="w-full bg-black border border-zinc-800 rounded-2xl p-4"
              />

              <select
                value={form.configuration_group_id}
                onChange={e =>
                  setForm(prev => ({
                    ...prev,
                    configuration_group_id:
                      e.target.value,
                  }))
                }
                className="w-full bg-black border border-zinc-800 rounded-2xl p-4"
              >

                <option value="">
                  Select Configuration Group
                </option>

                {groups.map(group => (

                  <option
                    key={group.id}
                    value={group.id}
                  >
                    {group.name}
                  </option>

                ))}

              </select>

              <button
                onClick={createModifier}
                disabled={loading}
                className="w-full bg-cyan-500 hover:bg-cyan-400 transition-all rounded-2xl p-4 font-bold text-black"
              >
                CREATE CONFIGURATION
              </button>

            </div>

          </div>

        </div>

        <div className="xl:col-span-2 border border-zinc-800 bg-zinc-950 rounded-3xl p-6">

          <div className="flex items-center gap-3 mb-6">

            <Settings2 />

            <h2 className="text-2xl font-bold">
              Configuration Library
            </h2>

          </div>

          <div className="space-y-4 max-h-[900px] overflow-auto">

            {groups.map(group => (

              <div
                key={group.id}
                className="border border-zinc-800 rounded-3xl p-5 bg-black"
              >

                <div className="flex items-center justify-between mb-5">

                  <div>

                    <div className="text-2xl font-bold">
                      {group.name}
                    </div>

                    <div className="text-zinc-500 text-sm mt-2">

                      Required:
                      {' '}
                      {group.required
                        ? 'YES'
                        : 'NO'}

                      {' • '}

                      Multi:
                      {' '}
                      {group.multi_select
                        ? 'YES'
                        : 'NO'}

                    </div>

                  </div>

                </div>

                <div className="space-y-3">

                  {configurationOptions
                    .filter(
                      modifier =>
                        modifier.configuration_group_id ===
                        group.id
                    )
                    .map(modifier => (

                      <div
                        key={modifier.id}
                        className="border border-zinc-800 rounded-2xl p-4 flex items-center justify-between"
                      >

                        <div className="font-bold">
                          {modifier.name}
                        </div>

                        <div className="text-cyan-400 font-black">
                          ฿
                          {modifier.price}
                        </div>

                      </div>

                    ))}

                </div>

              </div>

            ))}

          </div>

        </div>

      </div>

    </div>

  )
}
