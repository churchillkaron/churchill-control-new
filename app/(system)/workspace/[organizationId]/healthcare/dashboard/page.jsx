"use client";

import { useOrganization } from "@/app/providers/OrganizationProvider";
import { useDashboard } from "../hooks/useDashboard";

export default function HealthcareDashboardPage() {
  const { organization } = useOrganization();

  const {
    metrics,
    loading,
  } = useDashboard(
    organization?.id
  );

  return (
    <main className="p-6">
      <h1 className="mb-6 text-3xl font-bold">
        Healthcare Dashboard
      </h1>

      <div className="grid gap-6 md:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <div className="text-sm text-zinc-400">
            Patients
          </div>
          <div className="mt-2 text-4xl font-bold">
            {loading
              ? "..."
              : metrics.patients || 0}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <div className="text-sm text-zinc-400">
            Appointments
          </div>
          <div className="mt-2 text-4xl font-bold">
            {loading
              ? "..."
              : metrics.appointments || 0}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <div className="text-sm text-zinc-400">
            Admissions
          </div>
          <div className="mt-2 text-4xl font-bold">
            {loading
              ? "..."
              : metrics.admissions || 0}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <div className="text-sm text-zinc-400">
            Beds
          </div>
          <div className="mt-2 text-4xl font-bold">
            {loading
              ? "..."
              : metrics.beds || 0}
          </div>
        </div>
      </div>
    </main>
  );
}
