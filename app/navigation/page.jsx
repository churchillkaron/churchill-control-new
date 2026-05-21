export const dynamic = "force-dynamic";

import Link from 'next/link'

import { getNavigationModules } from '@/lib/navigation/getNavigationModules'

export default async function NavigationPage() {

  const modules =
    await getNavigationModules()

  return (

    <div className="min-h-screen bg-black text-white p-8">

      <div className="mb-12">

        <h1 className="text-5xl font-bold">
          Churchill Navigation Center
        </h1>

        <p className="text-zinc-400 mt-3 text-lg">
          Enterprise Restaurant Operating System
        </p>

      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">

        {modules.map(module => (

          <Link
            key={module.name}
            href={module.path}
            className="
              bg-white/10
              border
              border-white/10
              rounded-3xl
              backdrop-blur-xl
              p-8
              hover:bg-white/15
              transition-all
            "
          >

            <div className="text-2xl font-bold">
              {module.name}
            </div>

            <div className="text-zinc-500 mt-3">
              {module.path}
            </div>

          </Link>
        ))}

      </div>

    </div>
  )
}
