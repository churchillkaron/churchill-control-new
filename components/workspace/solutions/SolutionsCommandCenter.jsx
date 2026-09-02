"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Layers3, LoaderCircle, RefreshCw, Search, ShieldCheck } from "lucide-react";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

function text(value) {
  return String(value ?? "").trim();
}

function readinessTone(status) {
  if (status === "READY") return "bg-emerald-50 text-emerald-700 border-emerald-200/70";
  if (status === "BLOCKED") return "bg-red-50 text-red-700 border-red-200/70";
  return "bg-amber-50 text-amber-800 border-amber-200/70";
}

export default function SolutionsCommandCenter({ organizationId }) {
  const businessContext = useBusinessContext() || {};
  const entityId = businessContext.entity_id || businessContext.entity?.id || null;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  async function load() {
    if (!organizationId) return;
    setLoading(true);
    setError("");
    try {
      const url = new URL("/api/workspace/solutions/command-center", window.location.origin);
      url.searchParams.set("organizationId", organizationId);
      if (entityId) url.searchParams.set("entityId", entityId);
      const response = await fetch(url.toString(), { credentials: "include", cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json?.success) throw new Error(json?.error || "Unable to load Solutions");
      setData(json);
    } catch (loadError) {
      setError(loadError?.message || "Unable to load Solutions");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [organizationId, entityId]);

  async function act(solution, action) {
    setWorking(`${solution.id}:${action}`);
    setError("");
    try {
      const response = await fetch("/api/workspace/solutions/command-center", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          organizationId,
          entityId,
          templateId: solution.id,
          action,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json?.success) throw new Error(json?.error || "Solution action failed");
      await load();
    } catch (actionError) {
      setError(actionError?.message || "Solution action failed");
    } finally {
      setWorking("");
    }
  }

  const solutions = Array.isArray(data?.solutions) ? data.solutions : [];
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return solutions;
    return solutions.filter((solution) =>
      [solution.name, solution.industry, solution.description, ...(solution.required_modules || [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [solutions, query]);

  const metrics = data?.metrics || {};
  const entitlementKnown = Boolean(data?.entitlement?.known);

  return (
    <main className="min-h-screen bg-[#F7F6F3] p-4 text-[#1B1A18] md:p-6 lg:p-8">
      <div className="mx-auto max-w-[1750px] space-y-5">
        <section className="rounded-[26px] border border-black/[0.075] bg-white p-6 shadow-[0_12px_38px_rgba(31,27,20,0.045)]">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#A37849]">Solutions</div>
              <h1 className="mt-2 text-[31px] font-semibold tracking-[-0.04em]">Industry Solution Control</h1>
              <p className="mt-2 max-w-3xl text-[12px] leading-5 text-[#706B64]">
                Compose industry-ready capability packs from the shared Avantiqo core without hardcoding industry behavior into Finance, Operations, People or other owning domains.
              </p>
            </div>
            <button type="button" onClick={load} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#1F1E1B] px-3.5 text-[11px] font-medium text-white disabled:opacity-40">
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
            </button>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Catalog", metrics.catalog || 0, "Available solution packs"],
            ["Installed", metrics.installed || 0, "Organization/entity installations"],
            ["Ready", metrics.ready || 0, "All required modules enabled"],
            ["Needs attention", metrics.needs_attention || 0, entitlementKnown ? "Module/readiness gaps" : "Entitlement evidence also incomplete"],
          ].map(([label, value, detail]) => (
            <div key={label} className="rounded-2xl border border-black/[0.075] bg-white p-4">
              <div className="text-[9px] font-medium uppercase tracking-[0.14em] text-[#817D76]">{label}</div>
              <div className="mt-3 text-[25px] font-semibold tracking-[-0.035em]">{value}</div>
              <div className="mt-1 text-[10px] text-[#8A867F]">{detail}</div>
            </div>
          ))}
        </section>

        {!entitlementKnown ? (
          <section className="rounded-xl border border-amber-300/50 bg-amber-50 px-4 py-3 text-[11px] text-amber-900">
            <div className="flex gap-2"><ShieldCheck size={15} className="mt-0.5" /><div><div className="font-semibold">Commercial entitlement is not currently evidenced</div><div className="mt-1 text-amber-800">Solutions can be installed and assessed, but Avantiqo will not silently activate paid modules without subscription/package evidence.</div></div></div>
          </section>
        ) : null}

        {error ? <div className="rounded-xl border border-red-700/15 bg-red-50 px-4 py-3 text-[11px] text-red-800"><AlertTriangle size={13} className="mr-2 inline" />{error}</div> : null}

        <section className="rounded-[22px] border border-black/[0.075] bg-white">
          <div className="flex flex-col gap-3 border-b border-black/[0.06] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div><div className="text-[9px] font-medium uppercase tracking-[0.14em] text-[#8A847C]">Solution catalog</div><h2 className="mt-1 text-[18px] font-semibold">Install, assess and operate solution packs</h2></div>
            <label className="relative"><Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#99938B]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search solution or module" className="h-9 w-full rounded-lg border border-black/[0.09] bg-[#FCFBF9] pl-8 pr-3 text-[10px] outline-none sm:w-64" /></label>
          </div>

          {loading && !data ? (
            <div className="flex min-h-[320px] items-center justify-center text-[11px] text-[#817D76]"><LoaderCircle size={16} className="mr-2 animate-spin" />Loading solution readiness…</div>
          ) : (
            <div className="grid gap-3 p-4 xl:grid-cols-2">
              {filtered.map((solution) => {
                const installed = Boolean(solution.installed);
                const status = solution.readiness_status || "UNKNOWN";
                const currentStatus = solution.installation?.status || "NOT_INSTALLED";
                const busy = working.startsWith(`${solution.id}:`);
                return (
                  <article key={solution.id} className="rounded-2xl border border-black/[0.07] bg-[#FCFBF9] p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2"><h3 className="text-[14px] font-semibold text-[#37332D]">{solution.name}</h3><span className={`rounded-full border px-2 py-0.5 text-[8px] font-semibold ${readinessTone(status)}`}>{status}</span></div>
                        <div className="mt-1 text-[9px] uppercase tracking-[0.12em] text-[#938C83]">{solution.industry || "Solution"} · v{solution.version}</div>
                        <p className="mt-2 text-[10px] leading-4 text-[#7B756D]">{solution.description || "Configured Avantiqo capability pack."}</p>
                      </div>
                      <Layers3 size={17} className="shrink-0 text-[#A37849]" />
                    </div>

                    <div className="mt-4 grid gap-2 sm:grid-cols-3">
                      <div className="rounded-lg border border-black/[0.06] bg-white p-2.5"><div className="text-[8px] uppercase tracking-[0.1em] text-[#968F86]">Required</div><div className="mt-1 text-[13px] font-semibold">{solution.required_modules?.length || 0}</div></div>
                      <div className="rounded-lg border border-black/[0.06] bg-white p-2.5"><div className="text-[8px] uppercase tracking-[0.1em] text-[#968F86]">Missing enabled</div><div className="mt-1 text-[13px] font-semibold">{solution.missing_enabled?.length || 0}</div></div>
                      <div className="rounded-lg border border-black/[0.06] bg-white p-2.5"><div className="text-[8px] uppercase tracking-[0.1em] text-[#968F86]">Installed state</div><div className="mt-1 truncate text-[11px] font-semibold">{currentStatus}</div></div>
                    </div>

                    {(solution.missing_enabled?.length || solution.unknown_modules?.length || solution.missing_entitlement?.length) ? (
                      <div className="mt-3 space-y-1 text-[9px] text-[#7D776F]">
                        {solution.missing_enabled?.length ? <div><span className="font-semibold text-amber-800">Modules not enabled:</span> {solution.missing_enabled.join(", ")}</div> : null}
                        {solution.missing_entitlement?.length ? <div><span className="font-semibold text-red-700">Not entitled:</span> {solution.missing_entitlement.join(", ")}</div> : null}
                        {solution.unknown_modules?.length ? <div><span className="font-semibold text-red-700">Unknown module IDs:</span> {solution.unknown_modules.join(", ")}</div> : null}
                      </div>
                    ) : (
                      <div className="mt-3 flex items-center gap-2 text-[9px] text-emerald-700"><CheckCircle2 size={12} />All declared required modules are enabled.</div>
                    )}

                    <div className="mt-4 flex flex-wrap gap-2 border-t border-black/[0.06] pt-3">
                      {!installed ? <button type="button" disabled={busy} onClick={() => act(solution, "INSTALL")} className="rounded-lg bg-[#1F1E1B] px-3 py-2 text-[9px] font-medium text-white disabled:opacity-40">Install</button> : null}
                      {installed && currentStatus !== "ACTIVE" ? <button type="button" disabled={busy || status !== "READY"} onClick={() => act(solution, "ACTIVATE")} className="rounded-lg bg-[#1F1E1B] px-3 py-2 text-[9px] font-medium text-white disabled:opacity-35">Activate</button> : null}
                      {installed ? <button type="button" disabled={busy} onClick={() => act(solution, "RECHECK")} className="rounded-lg border border-black/[0.09] bg-white px-3 py-2 text-[9px] font-medium text-[#5E5851] disabled:opacity-40">Recheck</button> : null}
                      {installed && currentStatus === "ACTIVE" ? <button type="button" disabled={busy} onClick={() => act(solution, "DISABLE")} className="rounded-lg border border-black/[0.09] bg-white px-3 py-2 text-[9px] font-medium text-[#5E5851] disabled:opacity-40">Disable</button> : null}
                      {solution.route ? <Link href={`/workspace/${organizationId}${solution.route}`} className="ml-auto inline-flex items-center gap-1 rounded-lg border border-[#D6A66A]/40 bg-[#D6A66A]/10 px-3 py-2 text-[9px] font-medium text-[#8A6239]">Open solution <ArrowRight size={10} /></Link> : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
