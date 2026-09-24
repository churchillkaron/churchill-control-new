"use client";

import { useState } from "react";

export default function TripadvisorIntegrationCard({ organizationId, onboarding = false }) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function search() {
    if (!query.trim()) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/administration/integrations/tripadvisor?organizationId=${encodeURIComponent(organizationId)}&q=${encodeURIComponent(query.trim())}`,
        { cache: "no-store" },
      );
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Tripadvisor search failed");
      setRows(Array.isArray(data.rows) ? data.rows : []);
      if (!data.rows?.length) setMessage("No matching Tripadvisor locations found.");
    } catch (error) {
      setMessage(error?.message || "Tripadvisor search failed");
    } finally {
      setBusy(false);
    }
  }

  async function connect(locationId) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/administration/integrations/tripadvisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, locationId }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Tripadvisor connection failed");
      setMessage(`${data.location?.name || "Tripadvisor"} connected.`);
      setRows([]);
    } catch (error) {
      setMessage(error?.message || "Tripadvisor connection failed");
    } finally {
      setBusy(false);
    }
  }

  if (onboarding) {
    return (
      <main className="min-h-screen bg-[#F7F6F3] p-6 text-[#2D2822] lg:p-10">
        <div className="mx-auto max-w-3xl">
          <a href={`/workspace/${encodeURIComponent(organizationId)}/administration/communications-setup?onboarding=1`} className="text-[9px] font-semibold text-[#8A633C]">← Channels & connections</a>
          <section className="mt-5 rounded-[24px] border border-black/[0.07] bg-white p-6 lg:p-8">
            <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#A37849]">Business presence & reviews</div>
            <h1 className="mt-2 text-[30px] font-semibold tracking-[-0.04em]">Tripadvisor</h1>
            <p className="mt-2 text-[10px] leading-5 text-[#777169]">Search for the company’s real Tripadvisor listing and select the exact location. Avantiqo manages the partner API connection.</p>
            <div className="mt-5 flex gap-2">
              <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && search()} placeholder="Business name or address" className="h-10 min-w-0 flex-1 rounded-xl border border-black/[0.08] bg-white px-3 text-[10px] outline-none focus:border-[#D6A66A]/70" />
              <button type="button" onClick={search} disabled={busy || !query.trim()} className="h-10 rounded-xl bg-[#25231F] px-4 text-[10px] font-semibold text-[#191919] disabled:opacity-35">{busy ? "Working…" : "Search"}</button>
            </div>
            {message ? <div className="mt-4 rounded-xl border border-[#C9AD89]/20 bg-[#FBF6EF] px-4 py-3 text-[10px] text-[#6E5942]">{message}</div> : null}
            <div className="mt-4 space-y-2">
              {rows.map((row) => (
                <div key={row.id} className="flex items-center justify-between gap-4 rounded-2xl border border-black/[0.07] bg-[#FCFBF8] p-4">
                  <div className="min-w-0">
                    <div className="truncate text-[10px] font-semibold text-[#433B33]">{row.name}</div>
                    {row.address ? <div className="mt-1 truncate text-[9px] text-[#8A837A]">{row.address}</div> : null}
                  </div>
                  <button type="button" onClick={() => connect(row.id)} disabled={busy} className="h-8 shrink-0 rounded-xl border border-black/[0.08] bg-white px-3 text-[9px] font-semibold text-[#5A5249] disabled:opacity-40">Connect</button>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F7F6F3] p-6 text-[#191919] lg:p-10">
      <div className="mx-auto max-w-3xl rounded-[30px] border border-black/[0.08] bg-[#FBF8F3] p-6 lg:p-8">
        <a href={`/workspace/${encodeURIComponent(organizationId)}/administration/integrations`} className="text-sm text-[#D6A66A]">← Integrations</a>
        <div className="mt-8 text-xs uppercase tracking-[0.22em] text-[#A19A92]">Reputation</div>
        <h1 className="mt-2 text-4xl font-light">Connect Tripadvisor</h1>
        <p className="mt-3 text-sm leading-6 text-[#746E66]">
          Search for the business. Avantiqo handles the Tripadvisor partner connection in the background.
        </p>

        <div className="mt-6 flex gap-3">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && search()}
            placeholder="Business name or address"
            className="min-w-0 flex-1 rounded-xl border border-black/[0.08] bg-[#F7F6F3] px-4 py-3 text-sm text-[#191919] outline-none"
          />
          <button type="button" onClick={search} disabled={busy || !query.trim()} className="rounded-xl bg-[#D6A66A] px-5 py-3 text-sm font-semibold text-black disabled:opacity-40">
            {busy ? "Working…" : "Search"}
          </button>
        </div>

        {message ? <div className="mt-4 rounded-xl border border-black/[0.08] bg-[#FBF8F3] px-4 py-3 text-sm text-[#5F5A54]">{message}</div> : null}

        <div className="mt-5 space-y-3">
          {rows.map((row) => (
            <div key={row.id} className="flex items-center justify-between gap-4 rounded-2xl border border-black/[0.08] bg-[#FBF8F3] p-4">
              <div className="min-w-0">
                <div className="truncate font-medium text-[#191919]">{row.name}</div>
                {row.address ? <div className="mt-1 truncate text-xs text-[#918B83]">{row.address}</div> : null}
              </div>
              <button type="button" onClick={() => connect(row.id)} disabled={busy} className="shrink-0 rounded-xl border border-black/[0.08] bg-[#FBF8F3] px-4 py-2 text-xs text-[#2F2C28] disabled:opacity-40">Connect</button>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
