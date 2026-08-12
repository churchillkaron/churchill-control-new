"use client";

import { useState } from "react";

export default function TripadvisorIntegrationCard({ organizationId }) {
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

  return (
    <main className="min-h-screen bg-black p-6 text-white lg:p-10">
      <div className="mx-auto max-w-3xl rounded-[30px] border border-white/10 bg-white/[0.025] p-6 lg:p-8">
        <a href={`/workspace/${encodeURIComponent(organizationId)}/administration/integrations`} className="text-sm text-[#D6A66A]">← Integrations</a>
        <div className="mt-8 text-xs uppercase tracking-[0.22em] text-white/30">Reputation</div>
        <h1 className="mt-2 text-4xl font-light">Connect Tripadvisor</h1>
        <p className="mt-3 text-sm leading-6 text-white/45">
          Search for the business. Avantiqo handles the Tripadvisor partner connection in the background.
        </p>

        <div className="mt-6 flex gap-3">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && search()}
            placeholder="Business name or address"
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black px-4 py-3 text-sm text-white outline-none"
          />
          <button type="button" onClick={search} disabled={busy || !query.trim()} className="rounded-xl bg-[#D6A66A] px-5 py-3 text-sm font-semibold text-black disabled:opacity-40">
            {busy ? "Working…" : "Search"}
          </button>
        </div>

        {message ? <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/65">{message}</div> : null}

        <div className="mt-5 space-y-3">
          {rows.map((row) => (
            <div key={row.id} className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/25 p-4">
              <div className="min-w-0">
                <div className="truncate font-medium text-white">{row.name}</div>
                {row.address ? <div className="mt-1 truncate text-xs text-white/35">{row.address}</div> : null}
              </div>
              <button type="button" onClick={() => connect(row.id)} disabled={busy} className="shrink-0 rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2 text-xs text-white/75 disabled:opacity-40">Connect</button>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
