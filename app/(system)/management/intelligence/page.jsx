'use client'

import Link from 'next/link'
import PageWrapper from '@/components/PageWrapper'
import { intelligenceLayers } from './layers'

export default function IntelligenceIndexPage() {
  return (
    <PageWrapper
      title="Intelligence Engine"
      subtitle="One scalable system replacing all duplicated intelligence pages"
    >
      <div className="p-6 text-white">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {intelligenceLayers.map(layer => (
            <Link
              key={layer.slug}
              href={`/management/intelligence/${layer.slug}`}
              className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6 hover:bg-zinc-900 transition"
            >
              <div className="text-2xl font-semibold mb-2">
                {layer.title}
              </div>

              <div className="text-zinc-400">
                {layer.subtitle}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </PageWrapper>
  )
}
