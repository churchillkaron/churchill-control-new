"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Building2,
  Crown,
} from "lucide-react";

export default function PlatformWorkspacePage() {
  const router = useRouter();
  const [workspace, setWorkspace] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectingOrganizationId, setSelectingOrganizationId] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadWorkspace() {
      try {
        const res = await fetch("/api/workspace/list", {
          cache: "no-store",
        });
        const data = await res.json();

        if (!res.ok || !data?.success) {
          throw new Error(data?.error || "Unable to load workspace");
        }

        setWorkspace(data);
      } catch (err) {
        console.error(err);
        setError(err?.message || "Unable to load workspace");
      } finally {
        setLoading(false);
      }
    }

    loadWorkspace();
  }, []);

  async function selectOrganization(organizationId) {
    if (!organizationId || selectingOrganizationId) return;

    setSelectingOrganizationId(organizationId);
    setError(null);

    try {
      const response = await fetch("/api/session/organization", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ organizationId }),
      });

      const data = await response.json();

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Unable to select organization");
      }

      router.push(`/workspace/${organizationId}`);
      router.refresh();
    } catch (err) {
      console.error(err);
      setError(err?.message || "Unable to select organization");
      setSelectingOrganizationId(null);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#030712] text-white p-10">
        <div className="animate-pulse text-white/40">
          Loading platform workspace...
        </div>
      </main>
    );
  }

  const organizations = workspace?.organizations || [];
  const industries = workspace?.industries || [];

  return (
    <main className="min-h-screen bg-[#030712] text-white p-10">
      <div className="mx-auto max-w-7xl">
        <section className="mb-12 overflow-hidden rounded-[42px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(139,92,246,0.28),transparent_34%),linear-gradient(135deg,rgba(23,19,45,0.96),rgba(7,15,26,0.98))] px-10 py-10 shadow-[0_30px_120px_rgba(0,0,0,0.45)]">
          <div className="mb-6 flex items-center gap-3">
            <Crown className="h-6 w-6 text-violet-300" />
            <span className="text-xs uppercase tracking-[0.30em] text-violet-300/80">
              Enterprise Runtime Active
            </span>
          </div>

          <h1 className="text-6xl font-light tracking-[-0.06em]">
            Avantiqo Platform
          </h1>

          <p className="mt-4 max-w-3xl text-white/60">
            Enterprise Operating System for hospitality, accounting, services, entertainment and multi-company operations.
          </p>
        </section>

        {error ? (
          <div className="mb-8 rounded-3xl border border-red-400/20 bg-red-500/10 px-5 py-4 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        <section className="mb-16">
          <div className="mb-6 flex items-center gap-3">
            <Building2 className="h-5 w-5 text-[#8B5CF6]" />
            <h2 className="text-xl font-light">Organizations</h2>
          </div>

          {organizations.length ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {organizations.map((org) => (
                <button
                  key={org.id}
                  type="button"
                  onClick={() => selectOrganization(org.id)}
                  disabled={Boolean(selectingOrganizationId)}
                  className="group text-left rounded-3xl border border-white/10 bg-white/[0.03] p-6 transition hover:border-[#8B5CF6]/40 hover:bg-white/[0.05] disabled:cursor-wait disabled:opacity-60"
                >
                  <div className="mb-6 flex items-center justify-between">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                      <Building2 className="h-5 w-5 text-[#8B5CF6]" />
                    </div>
                    <ArrowUpRight className="h-5 w-5 text-white/30 transition group-hover:text-[#8B5CF6]" />
                  </div>
                  <p className="text-lg">{org.name}</p>
                  <p className="mt-2 text-sm text-white/40">
                    {selectingOrganizationId === org.id
                      ? "Opening organization..."
                      : org.organization_type || "Organization"}
                  </p>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 text-sm text-white/50">
              No active organizations are available for this account.
            </div>
          )}
        </section>

        <section className="mb-16">
          <div className="mb-6 flex items-center gap-3">
            <Building2 className="h-5 w-5 text-[#8B5CF6]" />
            <h2 className="text-xl font-light">Industries</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {industries.map((ind) => (
              <Link key={ind.industry_id} href={`/workspace/platform/${ind.industry_id}`}>
                <div className="group rounded-3xl border border-white/10 bg-white/[0.03] p-6 transition hover:border-[#8B5CF6]/40 hover:bg-white/[0.05]">
                  <p className="text-lg font-semibold">{ind.name || ind.industry_id}</p>
                  <p className="mt-2 text-sm text-white/40">
                    {ind.runtime?.modules?.length || 0} Modules
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
