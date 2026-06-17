"use client";

import { useOrganization } from "@/app/providers/OrganizationProvider";

export default function RadiologyPage() {
  const { organization } = useOrganization();

  return (
    <main className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">
          Radiology
        </h1>

        <p className="text-zinc-400">
          {organization?.name}
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <div className="text-sm text-zinc-400">
            X-Ray
          </div>

          <div className="mt-2 text-4xl font-bold">
            0
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <div className="text-sm text-zinc-400">
            CT Scan
          </div>

          <div className="mt-2 text-4xl font-bold">
            0
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <div className="text-sm text-zinc-400">
            MRI
          </div>

          <div className="mt-2 text-4xl font-bold">
            0
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <div className="text-sm text-zinc-400">
            Ultrasound
          </div>

          <div className="mt-2 text-4xl font-bold">
            0
          </div>
        </div>
      </div>
    </main>
  );
}
