"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, ClipboardList, RefreshCw, ShieldAlert } from "lucide-react";

function text(value) { return String(value ?? "").trim(); }

function tone(value) {
  return value === "critical"
    ? "border-[#B36B52]/25 bg-[#B36B52]/[0.06] text-[#8B4937]"
    : "border-[#D6A66A]/30 bg-[#D6A66A]/[0.07] text-[#76583A]";
}

export default function PestControlMonitoringExceptionWorkspace({ organizationId }) {
  const [state, setState] = useState({ loading: true, error: "", data: null });
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const response = await fetch(`/api/service-management/monitoring-exceptions?organizationId=${encodeURIComponent(organizationId)}`, { cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.error || "Exception queue failed.");
      setState({ loading: false, error: "", data: json });
    } catch (error) {
      setState({ loading: false, error: error.message || "Exception queue failed.", data: null });
    }
  }, [organizationId]);

  useEffect(() => { load(); }, [load]);

  async function createAction(pointId) {
    setBusy(pointId);
    setMessage("");
    try {
      const response = await fetch("/api/service-management/monitoring-exceptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, action: "create_corrective_action", pointId }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.error || "Corrective action failed.");
      setMessage("Corrective action created and owned by Operations.");
      await load();
    } catch (error) {
      setMessage(error.message || "Corrective action failed.");
    } finally {
      setBusy("");
    }
  }

  const rows = state.data?.rows || [];
  const metrics = state.data?.metrics || {};
  const href = `/workspace/${encodeURIComponent(organizationId)}/operations/field-service/monitoring-points`;

  return (
    <main className="min-h-[calc(100vh-61px)] bg-[#F7F6F3] px-4 py-5 text-[#191919] md:px-8">
      <div className="mx-auto max-w-[1400px]">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-black/[0.07] pb-5">
          <div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-[#9A744B]">Pest Control</div>
            <h1 className="mt-1 text-[27px] font-medium tracking-[-0.04em]">Monitoring exceptions</h1>
            <p className="mt-1 text-[11px] text-[#777169]">Convert field signals into owned corrective decisions.</p>
          </div>
          <button onClick={load} className="rounded-lg border border-black/[0.08] bg-white p-2"><RefreshCw size={12} /></button>
        </header>

        {state.error ? <div className="mt-4 rounded-xl border border-[#B36B52]/20 bg-[#B36B52]/[0.05] p-3 text-[10px] text-[#8B4937]">{state.error}</div> : null}
        {message ? <div className="mt-4 rounded-xl border border-[#748267]/20 bg-[#748267]/[0.05] p-3 text-[10px] text-[#607057]">{message}</div> : null}

        <section className="mt-5 grid gap-3 md:grid-cols-5">
          {[["Needs action", metrics.needs_action], ["In progress", metrics.in_progress], ["Critical", metrics.critical], ["Repeat", metrics.repeat_patterns], ["Resolved", metrics.resolved_recent]].map(([label, value]) => <div key={label} className="rounded-2xl border border-black/[0.07] bg-white p-4"><div className="text-[8px] uppercase tracking-[0.1em] text-[#948D84]">{label}</div><div className="mt-2 text-[22px]">{value || 0}</div></div>)}
        </section>

        <section className="mt-5 space-y-3">
          {rows.map((row) => <article key={row.point_id} className="rounded-2xl border border-black/[0.07] bg-white p-5">
            <div className="flex flex-wrap justify-between gap-3">
              <div><div className="text-[12px] font-medium">{row.point_code}</div><div className="mt-1 text-[9px] text-[#8C857C]">{row.customer_name} · {row.customer_location_name} · {row.area || "Area unknown"}</div></div>
              <span className={`rounded-full border px-3 py-1 text-[8px] uppercase ${tone(row.severity)}`}>{row.severity}</span>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-[1fr_220px]">
              <div className="rounded-xl bg-[#FBFAF8] p-4 text-[10px] leading-5 text-[#655F57]"><ShieldAlert size={12} className="inline mr-2" />{row.recommendation}<br/>Signals: {row.signals.join(", ")} · Repeat streak: {row.repeat_streak}</div>
              <div>{row.active_action ? <div className="rounded-xl bg-[#FBFAF8] p-4 text-[9px]">Action: {row.active_action.status}</div> : <button disabled={busy === row.point_id} onClick={() => createAction(row.point_id)} className="w-full rounded-xl bg-[#2C2925] px-4 py-3 text-[9px] text-white">Create corrective action</button>}</div>
            </div>
          </article>)}
          {!state.loading && !rows.length ? <div className="rounded-2xl border border-black/[0.07] bg-white p-10 text-center text-[10px] text-[#817A72]"><CheckCircle2 className="mx-auto mb-2" />No active monitoring exceptions.</div> : null}
        </section>
      </div>
    </main>
  );
}
