"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUpRight, Building2, Crown } from "lucide-react";

const FALLBACK_BRAND = {
  workspaceTitle: "Platform Workspace",
  workspaceDescription: "Secure access to your organizations and workspaces.",
  runtimeLabel: "Workspace Access",
  logoSrc: null,
  logoAlt: "Platform",
};

export default function PlatformWorkspacePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const developerPortal = searchParams?.get("portal") === "developer";
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

      router.push(developerPortal ? `/workspace/${organizationId}/developers` : `/workspace/${organizationId}`);
      router.refresh();
    } catch (err) {
      console.error(err);
      setError(err?.message || "Unable to select organization");
      setSelectingOrganizationId(null);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#F7F6F3] p-10 text-[#191919]">
        <div className="animate-pulse text-[#918B83]">Loading workspace...</div>
      </main>
    );
  }

  const organizations = workspace?.organizations || [];
  const industries = workspace?.industries || [];
  const brand = workspace?.brand || FALLBACK_BRAND;

  return (
    <main className="min-h-screen bg-[#F7F6F3] p-10 text-[#191919]">
      <div className="mx-auto max-w-7xl">
        <section className="mb-12 overflow-hidden rounded-[42px] border border-black/[0.08] bg-[radial-gradient(circle_at_top_left,rgba(214,166,106,0.16),transparent_38%),linear-gradient(135deg,#FFFFFF,#FBF8F3)] px-10 py-10 shadow-[0_24px_80px_rgba(25,25,25,0.08)]">
          {brand.logoSrc ? (
            <img
              src={brand.logoSrc}
              alt={brand.logoAlt}
              className="mb-7 h-20 w-auto max-w-full object-contain object-left"
            />
          ) : null}

          <div className="mb-6 flex items-center gap-3">
            <Crown className="h-6 w-6 text-[#9B6F3F]" />
            <span className="text-xs uppercase tracking-[0.30em] text-[#9B6F3F]/80">
              {developerPortal ? "Developer Workspace Access" : brand.runtimeLabel}
            </span>
          </div>

          <h1 className="text-6xl font-light tracking-[-0.06em]">
            {developerPortal ? "Choose a developer organization" : brand.workspaceTitle}
          </h1>

          <p className="mt-4 max-w-3xl text-[#746E66]">
            {developerPortal ? "Select the organization whose APIs, capabilities, integrations and compute you want to work with." : brand.workspaceDescription}
          </p>
        </section>

        {error ? (
          <div className="mb-8 rounded-3xl border border-[#B7654C]/25 bg-[#FBF1EE] px-5 py-4 text-sm text-[#914B38]">
            {error}
          </div>
        ) : null}

        <section className="mb-16">
          <div className="mb-6 flex items-center gap-3">
            <Building2 className="h-5 w-5 text-[#D6A66A]" />
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
                  className="group rounded-3xl border border-black/[0.08] bg-white p-6 text-left transition hover:border-[#D6A66A]/55 hover:bg-[#FBF8F3] disabled:cursor-wait disabled:opacity-60"
                >
                  <div className="mb-6 flex items-center justify-between">
                    <div className="rounded-2xl border border-black/[0.08] bg-[#FBF8F3] p-3">
                      <Building2 className="h-5 w-5 text-[#D6A66A]" />
                    </div>
                    <ArrowUpRight className="h-5 w-5 text-[#A19A92] transition group-hover:text-[#D6A66A]" />
                  </div>
                  <p className="text-lg">{org.name}</p>
                  <p className="mt-2 text-sm text-[#817A72]">
                    {selectingOrganizationId === org.id
                      ? "Opening organization..."
                      : org.organization_type || "Organization"}
                  </p>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-3xl border border-black/[0.08] bg-white p-6 text-sm text-[#746E66]">
              No active organizations are available for this account.
            </div>
          )}
        </section>

        <section className="mb-16">
          <div className="mb-6 flex items-center gap-3">
            <Building2 className="h-5 w-5 text-[#D6A66A]" />
            <h2 className="text-xl font-light">Industries</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {industries.map((industry) => (
              <Link
                key={industry.industry_id}
                href={`/workspace/platform/${industry.industry_id}`}
              >
                <div className="group rounded-3xl border border-black/[0.08] bg-white p-6 transition hover:border-[#D6A66A]/55 hover:bg-[#FBF8F3]">
                  <p className="text-lg font-semibold">
                    {industry.name || industry.industry_id}
                  </p>
                  <p className="mt-2 text-sm text-[#817A72]">
                    {industry.runtime?.modules?.length || 0} Modules
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
