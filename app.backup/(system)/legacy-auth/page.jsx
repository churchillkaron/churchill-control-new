"use client";

export const dynamic = "force-dynamic";

import {
  AlertTriangle,
  ArrowRight,
  ShieldAlert,
} from "lucide-react";

import {
  AUTH_LEGACY_REGISTRY,
} from "@/lib/shared/auth/legacy/authRegistry";

export default function LegacyAuthPage() {

  return (

    <main className="min-h-screen bg-black p-10 text-white">

      <div className="mb-10">

        <div className="mb-3 flex items-center gap-3">

          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-500/10">

            <ShieldAlert className="h-5 w-5 text-red-400" />

          </div>

          <div className="text-xs uppercase tracking-[0.3em] text-red-400">

            Churchill Auth Consolidation

          </div>

        </div>

        <h1 className="mb-4 text-7xl font-light">

          Legacy Auth

        </h1>

        <p className="max-w-4xl text-lg leading-relaxed text-white/50">

          Legacy authentication imports scheduled for migration into
          the centralized shared infrastructure layer.

        </p>

      </div>

      <div className="space-y-5">

        {AUTH_LEGACY_REGISTRY.map(
          item => (

            <div
              key={item.old}
              className="rounded-[32px] border border-red-500/20 bg-red-500/5 p-7"
            >

              <div className="mb-5 flex items-center justify-between">

                <div className="rounded-full bg-red-500/10 px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-red-400">

                  {item.status}

                </div>

                <AlertTriangle className="h-5 w-5 text-red-400" />

              </div>

              <div className="mb-4">

                <div className="mb-2 text-sm uppercase tracking-[0.2em] text-white/30">

                  Old Import

                </div>

                <div className="rounded-2xl border border-white/10 bg-black/40 p-4 font-mono text-sm text-red-300">

                  {item.old}

                </div>

              </div>

              <div className="flex items-center gap-3">

                <ArrowRight className="h-5 w-5 text-red-400" />

                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 font-mono text-sm text-emerald-300">

                  {item.replacement}

                </div>

              </div>

            </div>

          )
        )}

      </div>

    </main>

  );

}
