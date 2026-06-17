"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState, useEffect } from "react";
import { Building2, Boxes, ArrowUpRight, Users } from "lucide-react";
import { getIndustryRuntime } from "@/lib/platform/runtime/getIndustryRuntime";

export default function PlatformIndustryPage() {
  const params = useParams();
  const industryId = params?.industryId;

  const [modules, setModules] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchIndustryData() {
      try {
        const modulesRes =
          await fetch('/api/platform/modules');

        const modulesJson =
          await modulesRes.json();

        setModules(
          modulesJson.modules || []
        );

        const res = await fetch(`/api/workspace/industry-organizations?industryId=${industryId}`);
        const data = await res.json();
        if (data.success) {
          setOrganizations(data.organizations || []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchIndustryData();
  }, [industryId]);

  if (loading) {
    return (
      <main className="min-h-screen p-10 bg-[#030712] text-white">
        <div className="animate-pulse text-white/40">Loading industry workspace...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#030712] text-white p-10">
      <div className="mx-auto max-w-7xl">

        {/* Hero */}
        <section className="mb-12 overflow-hidden rounded-[42px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(139,92,246,0.28),transparent_34%),linear-gradient(135deg,rgba(23,19,45,0.96),rgba(7,15,26,0.98))] px-10 py-10">
          <div className="mb-4 flex items-center gap-3">
            <Building2 className="h-6 w-6 text-violet-300" />
            <span className="text-xs uppercase tracking-[0.30em] text-violet-300/80">Industry Runtime</span>
          </div>
          <h1 className="text-6xl font-light tracking-[-0.06em]">{industryId}</h1>
          <p className="mt-4 max-w-3xl text-white/60">Industry modules and organizations using this industry.</p>
        </section>

        {/* KPI Cards */}
        <section className="mb-12 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
            <Building2 className="mb-4 h-5 w-5 text-violet-300" />
            <div className="text-4xl font-light">{organizations.length}</div>
            <div className="mt-2 text-white/50">Organizations</div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
            <Users className="mb-4 h-5 w-5 text-violet-300" />
            <div className="text-4xl font-light">{modules.length}</div>
            <div className="mt-2 text-white/50">Modules</div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
            <Boxes className="mb-4 h-5 w-5 text-violet-300" />
            <div className="text-4xl font-light">
              {modules.filter(m => m.category === "Core").length}
            </div>
            <div className="mt-2 text-white/50">Core Modules</div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
            <Boxes className="mb-4 h-5 w-5 text-violet-300" />
            <div className="text-4xl font-light">
              {getIndustryRuntime(industryId)?.dashboards?.length || 0}
            </div>
            <div className="mt-2 text-white/50">Dashboards</div>
          </div>
        </section>

        {/* Organizations */}
        <section className="mb-16">
          <div className="mb-6 flex items-center gap-3">
            <Building2 className="h-5 w-5 text-[#8B5CF6]" />
            <h2 className="text-xl font-light">Organizations Using This Industry</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {organizations.map(org => (
              <Link key={org.id} href={`/workspace/${org.id}`}>
                <div className="group rounded-3xl border border-white/10 bg-white/[0.03] p-6 transition hover:border-[#8B5CF6]/40 hover:bg-white/[0.05]">
                  <p className="text-lg font-semibold">{org.name}</p>
                  <p className="mt-2 text-sm text-white/40">{org.organization_type}</p>
                </div>
              </Link>
            ))}
            {organizations.length === 0 && (
              <p className="mt-4 text-white/50">No organizations are using this industry yet.</p>
            )}
          </div>
        </section>

        {/* Modules */}
        <section>
          <div className="mb-6 flex items-center gap-3">
            <Boxes className="h-5 w-5 text-[#8B5CF6]" />
            <h2 className="text-xl font-light">Industry Modules</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {modules.map(module => {
              const usageCount = organizations.filter(org => org.modules?.includes(module.id)).length;
              return (
                <Link key={module.id} href={`/workspace/platform/${industryId}/${module.id}`}>
                  <div className="group rounded-3xl border border-white/10 bg-white/[0.03] p-6 transition hover:border-[#8B5CF6]/40 hover:bg-white/[0.05]">
                    <div className="mb-4 flex justify-between">
                      <Boxes className="h-5 w-5 text-[#8B5CF6]" />
                      <ArrowUpRight className="h-5 w-5 text-white/30" />
                    </div>
                    <p className="text-lg font-semibold">{module.name}</p>
                    <p className="mt-2 text-sm text-white/40">{usageCount} Organization{usageCount === 1 ? '' : 's'}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

      </div>
    </main>
  );
}
