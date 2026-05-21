"use client";

export const dynamic = "force-dynamic";

import {
  AlertTriangle,
  ArrowRight,
  Archive,
} from "lucide-react";

import {
  LEGACY_REGISTRY,
} from "@/lib/platform/legacy/legacyRegistry";

export default function LegacyPage() {

  return (

    <main className="min-h-screen bg-black p-10 text-white">

      <div className="mb-10">

        <div className="mb-3 text-xs uppercase tracking-[0.3em] text-red-400">

          Churchill Legacy Registry

        </div>

        <h1 className="mb-4 text-6xl font-light">

          Legacy Systems

        </h1>

        <p className="max-w-3xl text-lg text-white/50">

          Experimental, duplicate or deprecated systems scheduled for
          consolidation into the core runtime architecture.

        </p>

      </div>

      <div className="space-y-8">

        {Object.entries(
          LEGACY_REGISTRY
        ).map(
          ([group, systems]) => (

            <div
              key={group}
              className="rounded-[36px] border border-red-500/20 bg-red-500/5 p-8"
            >

              <div className="mb-8 flex items-center gap-4">

                <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-red-500/10">

                  <Archive className="h-8 w-8 text-red-400" />

                </div>

                <div>

                  <div className="mb-1 text-4xl font-light capitalize">

                    {group}

                  </div>

                  <div className="text-white/40">

                    Legacy consolidation group

                  </div>

                </div>

              </div>

              <div className="grid grid-cols-3 gap-5">

                {systems.map(
                  system => (

                    <div
                      key={system.name}
                      className="rounded-[28px] border border-red-500/20 bg-black/30 p-6"
                    >

                      <div className="mb-5 flex items-center justify-between">

                        <div className="rounded-full bg-red-500/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-red-400">

                          LEGACY

                        </div>

                        <AlertTriangle className="h-5 w-5 text-red-400" />

                      </div>

                      <div className="mb-3 text-2xl font-light">

                        {system.name}

                      </div>

                      <div className="mb-6 text-sm leading-relaxed text-white/40">

                        {system.reason}

                      </div>

                      <div className="flex items-center gap-2 text-sm text-white/50">

                        <ArrowRight className="h-4 w-4 text-red-400" />

                        Merge into

                        <span className="text-red-300">

                          /{system.mergeInto}

                        </span>

                      </div>

                    </div>

                  )
                )}

              </div>

            </div>

          )
        )}

      </div>

    </main>

  );

}
