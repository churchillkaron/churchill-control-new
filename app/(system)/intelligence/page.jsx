"use client";

import { useEffect, useMemo, useState } from "react";

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function readRequestedOrganizationId() {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("organizationId");
}

export default function IntelligencePage() {
  const [organizations, setOrganizations] = useState([]);
  const [organizationId, setOrganizationId] = useState(null);
  const [business, setBusiness] = useState(null);
  const [roi, setRoi] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadOrganizations() {
      try {
        const response = await fetch("/api/workspace/list", {
          cache: "no-store",
        });
        const json = await response.json();

        if (!response.ok || !json?.success) {
          throw new Error(json?.error || "Unable to load organizations");
        }

        if (!active) return;

        const rows = Array.isArray(json.organizations)
          ? json.organizations
          : [];
        const requested = readRequestedOrganizationId();
        const resolved =
          rows.find((item) => item.id === requested)?.id ||
          rows[0]?.id ||
          null;

        setOrganizations(rows);
        setOrganizationId(resolved);
      } catch (loadError) {
        if (active) {
          setError(loadError?.message || "Unable to load organizations");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadOrganizations();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!organizationId) {
      setBusiness(null);
      setRoi([]);
      return;
    }

    let active = true;

    async function loadIntelligence() {
      setLoading(true);
      setError("");

      try {
        const encoded = encodeURIComponent(organizationId);
        const [businessResponse, roiResponse] = await Promise.all([
          fetch(`/api/platform/intelligence/business?organizationId=${encoded}`, {
            cache: "no-store",
          }),
          fetch(`/api/platform/intelligence/roi?organizationId=${encoded}`, {
            cache: "no-store",
          }),
        ]);

        const [businessJson, roiJson] = await Promise.all([
          businessResponse.json(),
          roiResponse.json(),
        ]);

        if (!businessResponse.ok || businessJson?.success === false) {
          throw new Error(
            businessJson?.error || "Unable to load business intelligence",
          );
        }

        if (!roiResponse.ok || roiJson?.success === false) {
          throw new Error(roiJson?.error || "Unable to load ROI intelligence");
        }

        if (!active) return;

        setBusiness(businessJson?.data || null);
        setRoi(Array.isArray(roiJson?.data) ? roiJson.data : []);
      } catch (loadError) {
        if (active) {
          setError(loadError?.message || "Unable to load intelligence");
          setBusiness(null);
          setRoi([]);
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadIntelligence();

    return () => {
      active = false;
    };
  }, [organizationId]);

  const organization = useMemo(
    () => organizations.find((item) => item.id === organizationId) || null,
    [organizations, organizationId],
  );

  const totals = useMemo(
    () =>
      roi.reduce(
        (summary, row) => ({
          revenue: summary.revenue + Number(row?.revenue || 0),
          customers: summary.customers + Number(row?.customers || 0),
          events: summary.events + Number(row?.events || 0),
        }),
        { revenue: 0, customers: 0, events: 0 },
      ),
    [roi],
  );

  function changeOrganization(nextOrganizationId) {
    setOrganizationId(nextOrganizationId || null);

    if (typeof window !== "undefined" && nextOrganizationId) {
      const url = new URL(window.location.href);
      url.searchParams.set("organizationId", nextOrganizationId);
      window.history.replaceState({}, "", url.toString());
    }
  }

  return (
    <main className="min-h-screen bg-[#050505] px-6 py-8 text-white">
      <div className="mx-auto max-w-[1480px]">
        <header className="flex flex-col gap-6 border-b border-white/10 pb-7 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.32em] text-amber-300/65">
              Intelligence
            </div>
            <h1 className="mt-4 text-5xl font-light tracking-[-0.06em]">
              Business Intelligence
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/45">
              Organization-scoped attribution, channel performance and actionable business signals.
            </p>
          </div>

          <select
            value={organizationId || ""}
            onChange={(event) => changeOrganization(event.target.value)}
            className="min-w-72 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none"
          >
            {!organizations.length ? (
              <option value="">No organizations available</option>
            ) : null}
            {organizations.map((item) => (
              <option key={item.id} value={item.id} className="bg-black">
                {item.name}
              </option>
            ))}
          </select>
        </header>

        {error ? (
          <div className="mt-6 rounded-2xl border border-red-400/20 bg-red-500/10 px-5 py-4 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        {!organizationId && !loading ? (
          <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-sm text-white/50">
            Select an organization in Workspace to open its intelligence view.
          </div>
        ) : null}

        {organizationId ? (
          <>
            <section className="mt-7 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {[
                ["Organization", organization?.name || "Active organization"],
                ["Attributed Revenue", formatNumber(totals.revenue)],
                ["Attributed Customers", formatNumber(totals.customers)],
                ["Tracked Events", formatNumber(totals.events)],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-[26px] border border-white/[0.08] bg-white/[0.03] p-5"
                >
                  <div className="text-[10px] uppercase tracking-[0.24em] text-white/35">
                    {label}
                  </div>
                  <div className="mt-3 text-2xl font-light">{value}</div>
                </div>
              ))}
            </section>

            <section className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
              <div className="rounded-[30px] border border-white/[0.08] bg-white/[0.025] p-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.25em] text-white/35">
                      Channel ROI
                    </div>
                    <h2 className="mt-2 text-2xl font-light">Attribution performance</h2>
                  </div>
                  {loading ? <div className="text-xs text-white/35">Refreshing...</div> : null}
                </div>

                <div className="mt-6 overflow-x-auto">
                  <table className="w-full min-w-[620px] text-left text-sm">
                    <thead className="text-[10px] uppercase tracking-[0.2em] text-white/30">
                      <tr>
                        <th className="pb-3">Provider</th>
                        <th className="pb-3">Revenue</th>
                        <th className="pb-3">Customers</th>
                        <th className="pb-3">Events</th>
                      </tr>
                    </thead>
                    <tbody>
                      {roi.map((row) => (
                        <tr key={row.provider} className="border-t border-white/[0.07]">
                          <td className="py-4 text-white/80">{row.provider}</td>
                          <td className="py-4 text-white/65">{formatNumber(row.revenue)}</td>
                          <td className="py-4 text-white/65">{formatNumber(row.customers)}</td>
                          <td className="py-4 text-white/65">{formatNumber(row.events)}</td>
                        </tr>
                      ))}
                      {!roi.length && !loading ? (
                        <tr>
                          <td colSpan={4} className="border-t border-white/[0.07] py-8 text-white/35">
                            No attribution events are available for this organization yet.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-[30px] border border-white/[0.08] bg-white/[0.025] p-6">
                <div className="text-[11px] uppercase tracking-[0.25em] text-white/35">
                  Recommendations
                </div>
                <h2 className="mt-2 text-2xl font-light">Business signals</h2>

                <div className="mt-6 space-y-3">
                  {(business?.recommendations || []).map((item, index) => (
                    <div
                      key={`${item.provider || "signal"}-${item.type || index}`}
                      className="rounded-2xl border border-amber-300/15 bg-amber-300/[0.06] p-4"
                    >
                      <div className="text-[10px] uppercase tracking-[0.2em] text-amber-200/65">
                        {item.type || "Signal"}
                      </div>
                      <div className="mt-2 text-sm leading-6 text-white/70">
                        {item.message}
                      </div>
                    </div>
                  ))}

                  {!business?.recommendations?.length && !loading ? (
                    <div className="rounded-2xl border border-white/[0.07] p-4 text-sm text-white/35">
                      No business recommendations are active.
                    </div>
                  ) : null}
                </div>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
