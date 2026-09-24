"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ExternalLink, LoaderCircle, MapPin, RefreshCw, X } from "lucide-react";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";

function entityLabel(entity) {
  return entity?.display_name || entity?.legal_name || entity?.code || "Unnamed entity";
}

function assignmentState(location) {
  if (location?.entity_id) return "ASSIGNED";
  if (String(location?.metadata?.assignment_status || "").toUpperCase() === "IGNORED") return "IGNORED";
  return "UNASSIGNED";
}

export default function GoogleBusinessSetupPage() {
  const business = useBusinessContext();
  const organizationId = business?.organization_id || business?.organization?.id || null;
  const [snapshot, setSnapshot] = useState({ connection:null, locations:[], entities:[] });
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!organizationId) return;
    try {
      setLoading(true);
      setError("");
      const response = await fetch(`/api/administration/integrations/google-business?organizationId=${encodeURIComponent(organizationId)}`, { cache:"no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Unable to load Google Business Profile");
      setSnapshot({ connection:body.connection || null, locations:body.locations || [], entities:body.entities || [] });
    } catch (loadError) {
      setError(loadError?.message || "Unable to load Google Business Profile");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { if (business?.ready) load(); }, [business?.ready, load]);

  async function action(payload, key) {
    if (!organizationId || working) return null;
    setWorking(key);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/administration/integrations/google-business", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body:JSON.stringify({ organizationId, ...payload }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error(body?.error || "Google Business action failed");
      setSnapshot({ connection:body.connection || null, locations:body.locations || [], entities:body.entities || [] });
      return body;
    } catch (actionError) {
      setError(actionError?.message || "Google Business action failed");
      return null;
    } finally {
      setWorking("");
    }
  }

  async function discover() {
    const result = await action({ action:"discover", force:true }, "discover");
    if (result) setNotice("Google Business locations refreshed.");
  }

  async function mapLocation(location, entityId) {
    if (!entityId) return;
    const result = await action({ action:"map-location", assetId:location.id, entityId }, `map-${location.id}`);
    if (result) setNotice(`${location.name || "Google location"} assigned to this organization.`);
  }

  async function ignoreLocation(location) {
    const result = await action({ action:"ignore-location", assetId:location.id }, `ignore-${location.id}`);
    if (result) setNotice(`${location.name || "Google location"} marked as not belonging to this organization.`);
  }

  const connected = String(snapshot.connection?.status || "").toUpperCase() === "ACTIVE";
  const assigned = useMemo(() => snapshot.locations.filter((row) => assignmentState(row) === "ASSIGNED"), [snapshot.locations]);
  const ignored = useMemo(() => snapshot.locations.filter((row) => assignmentState(row) === "IGNORED"), [snapshot.locations]);
  const unresolved = useMemo(() => snapshot.locations.filter((row) => assignmentState(row) === "UNASSIGNED"), [snapshot.locations]);
  const complete = connected && assigned.length > 0 && unresolved.length === 0;

  if (loading || !business?.ready) {
    return <div className="flex min-h-[460px] items-center justify-center bg-[#F7F6F3] text-[10px] text-[#817B73]"><LoaderCircle size={14} className="mr-2 animate-spin" />Loading Google Business setup…</div>;
  }

  return (
    <main className="min-h-screen bg-[#F7F6F3] p-6 text-[#2D2822] lg:p-10">
      <div className="mx-auto max-w-4xl">
        <a href={`/workspace/${encodeURIComponent(organizationId)}/administration/communications-setup?onboarding=1`} className="text-[9px] font-semibold text-[#8A633C]">← Channels & connections</a>
        <section className="mt-5 rounded-[24px] border border-black/[0.07] bg-white p-6 lg:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#A37849]">Business presence & reviews</div>
              <h1 className="mt-2 text-[30px] font-semibold tracking-[-0.04em]">Google Business Profile</h1>
              <p className="mt-2 max-w-2xl text-[10px] leading-5 text-[#777169]">Authorize Google once, then explicitly choose which discovered locations belong to this organization. Other locations from the same Google account can be ignored here without disconnecting them from Google.</p>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-[8px] font-semibold ${complete ? "bg-emerald-50 text-emerald-700" : connected ? "bg-amber-50 text-amber-700" : "bg-[#F0E7DA] text-[#8A633C]"}`}>{complete ? "Configured" : connected ? "Review locations" : "Not connected"}</span>
          </div>

          {error ? <div className="mt-4 rounded-xl border border-red-700/15 bg-red-50 px-4 py-3 text-[10px] text-red-800">{error}</div> : null}
          {notice ? <div className="mt-4 rounded-xl border border-emerald-700/15 bg-emerald-50 px-4 py-3 text-[10px] text-emerald-800">{notice}</div> : null}

          {!connected ? (
            <a href={`/api/google/auth?organizationId=${encodeURIComponent(organizationId)}&onboarding=1`} className="mt-5 inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#25231F] px-4 text-[10px] font-semibold text-white">Connect Google Business<ExternalLink size={10} /></a>
          ) : (
            <>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-black/[0.07] bg-[#FCFBF8] px-4 py-3"><div className="text-[18px] font-semibold">{assigned.length}</div><div className="mt-1 text-[8px] uppercase tracking-[0.1em] text-[#928A81]">Assigned</div></div>
                <div className="rounded-xl border border-black/[0.07] bg-[#FCFBF8] px-4 py-3"><div className="text-[18px] font-semibold">{unresolved.length}</div><div className="mt-1 text-[8px] uppercase tracking-[0.1em] text-[#928A81]">Needs decision</div></div>
                <div className="rounded-xl border border-black/[0.07] bg-[#FCFBF8] px-4 py-3"><div className="text-[18px] font-semibold">{ignored.length}</div><div className="mt-1 text-[8px] uppercase tracking-[0.1em] text-[#928A81]">Not this organization</div></div>
              </div>

              <div className="mt-5 space-y-2.5">
                {snapshot.locations.map((location) => {
                  const state = assignmentState(location);
                  const busy = working === `map-${location.id}` || working === `ignore-${location.id}`;
                  return (
                    <div key={location.id} className="rounded-2xl border border-black/[0.07] bg-[#FCFBF8] p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-2.5">
                          <MapPin size={12} className="mt-0.5 shrink-0 text-[#A37849]" />
                          <div className="min-w-0">
                            <div className="truncate text-[10px] font-semibold text-[#433B33]">{location.name || "Google Business location"}</div>
                            <div className="mt-1 text-[8px] text-[#938B82]">{state === "ASSIGNED" ? "Assigned to this organization" : state === "IGNORED" ? "Marked as not this organization" : "Choose what this location means for this company"}</div>
                          </div>
                        </div>
                        {state === "ASSIGNED" ? <span className="inline-flex items-center gap-1 text-[8px] font-semibold text-emerald-700"><Check size={9} />Assigned</span> : state === "IGNORED" ? <span className="inline-flex items-center gap-1 text-[8px] font-semibold text-[#8A837A]"><X size={9} />Ignored</span> : null}
                      </div>

                      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                        <select value={location.entity_id || ""} onChange={(event) => mapLocation(location, event.target.value)} disabled={busy} className="h-9 min-w-0 flex-1 rounded-xl border border-black/[0.08] bg-white px-3 text-[9px] disabled:opacity-50">
                          <option value="">Assign to legal entity…</option>
                          {snapshot.entities.map((entity) => <option key={entity.id} value={entity.id}>{entityLabel(entity)}</option>)}
                        </select>
                        <button type="button" onClick={() => ignoreLocation(location)} disabled={busy || state === "IGNORED"} className="h-9 rounded-xl border border-black/[0.08] bg-white px-3 text-[9px] font-semibold text-[#6E655C] disabled:opacity-35">Not this organization</button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <button type="button" onClick={discover} disabled={Boolean(working)} className="mt-5 inline-flex h-9 items-center gap-1.5 rounded-xl border border-black/[0.08] bg-white px-3 text-[9px] font-semibold text-[#655D54] disabled:opacity-40"><RefreshCw size={10} className={working === "discover" ? "animate-spin" : ""} />Refresh Google locations</button>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
