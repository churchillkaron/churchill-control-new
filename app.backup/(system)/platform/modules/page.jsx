"use client";

export const dynamic = "force-dynamic";

import Link from 'next/link'

import PageWrapper from '@/components/PageWrapper'

import {
  getActiveModules,
  getPlannedModules,
} from '@/lib/shared/modules/moduleRegistry'

export default function PlatformModulesPage() {

  const activeModules =
    getActiveModules()

  const plannedModules =
    getPlannedModules()

  return (

    <PageWrapper
      title="Avantiqo Modules"
      subtitle="Central enterprise module infrastructure"
    >

      <div className="p-6 text-white space-y-10">

        <section>

          <div className="text-3xl font-semibold mb-6">
            Active Modules
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">

            {activeModules.map(
              module => (

                <Link
                  key={module.key}
                  href={`/management/intelligence/${module.key}`}
                  className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6 hover:bg-zinc-900 transition"
                >

                  <div className="flex items-center justify-between mb-4">

                    <div className="text-2xl font-semibold">
                      {module.name}
                    </div>

                    <div className="text-xs px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      ACTIVE
                    </div>

                  </div>

                  <div className="text-zinc-400 mb-4">
                    Connected operational infrastructure
                  </div>

                  <div className="space-y-2">

                    {module.dependsOn.map(
                      dependency => (

                        <div
                          key={dependency}
                          className="text-sm text-zinc-500"
                        >

                          • {dependency}

                        </div>

                      )
                    )}

                  </div>

                </Link>

              )
            )}

          </div>

        </section>

        <section>

          <div className="text-3xl font-semibold mb-6">
            Planned Modules
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">

            {plannedModules.map(
              module => (

                <div
                  key={module.key}
                  className="rounded-3xl border border-zinc-800 bg-black p-6 opacity-80"
                >

                  <div className="flex items-center justify-between mb-4">

                    <div className="text-2xl font-semibold">
                      {module.name}
                    </div>

                    <div className="text-xs px-3 py-1 rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                      PLANNED
                    </div>

                  </div>

                  <div className="text-zinc-500 mb-4">
                    Future enterprise infrastructure module
                  </div>

                  <div className="space-y-2">

                    {module.dependsOn.map(
                      dependency => (

                        <div
                          key={dependency}
                          className="text-sm text-zinc-600"
                        >

                          • {dependency}

                        </div>

                      )
                    )}

                  </div>

                </div>

              )
            )}

          </div>

        </section>

      </div>

    </PageWrapper>

  )
}
