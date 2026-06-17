"use client";

import { useOrganization } from "@/app/providers/OrganizationProvider";
import { useAnalytics } from "../hooks/useAnalytics";
import PatientsChart from "./components/PatientsChart";
import LabChart from "./components/LabChart";
import RadiologyChart from "./components/RadiologyChart";
import AdmissionsChart from "./components/AdmissionsChart";

export default function HealthcareAnalyticsPage() {
  const { organization } = useOrganization();

  const {
    analytics,
    loading,
  } = useAnalytics(
    organization?.id
  );

  const chartData =
    analytics.chartData || [];

  return (
    <main className="p-6">
      <h1 className="mb-6 text-3xl font-bold">
        Healthcare Analytics
      </h1>

      <div className="mb-8 grid gap-6 md:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <div className="text-sm text-zinc-400">
            Patients
          </div>
          <div className="mt-2 text-4xl font-bold">
            {loading ? "..." : analytics.totalPatients || 0}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <div className="text-sm text-zinc-400">
            Appointments
          </div>
          <div className="mt-2 text-4xl font-bold">
            {loading ? "..." : analytics.upcomingAppointments || 0}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <div className="text-sm text-zinc-400">
            Admissions
          </div>
          <div className="mt-2 text-4xl font-bold">
            {loading ? "..." : analytics.currentAdmissions || 0}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <div className="text-sm text-zinc-400">
            Beds
          </div>
          <div className="mt-2 text-4xl font-bold">
            {loading ? "..." : analytics.totalBeds || 0}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <PatientsChart data={chartData} />
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <AdmissionsChart data={chartData} />
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <LabChart data={chartData} />
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <RadiologyChart data={chartData} />
        </div>
      </div>
    </main>
  );
}
