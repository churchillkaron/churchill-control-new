"use client";

import { useEffect, useMemo, useState } from "react";
import { Inbox, RefreshCw, ShieldCheck } from "lucide-react";

function human(value) {
  return String(value || "").replaceAll("_", " ").toLowerCase();
}

export default function StaffIntakePage() {
  const [state, setState] = useState({ loading: true, assignments: [], error: "", message: "" });

  async function load() {
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const response = await fetch("/api/staff/intake", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Unable to load intake");
      setState((current) => ({ ...current, loading: false, assignments: payload.assignments || [], error: "" }));
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error?.message || "Unable to load intake" }));
    }
  }

  useEffect(() => { load(); }, []);

  async function act(assignmentId, action) {
    try {
      const response = await fetch("/api/staff/intake", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId, action }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Unable to update intake");
      setState((current) => ({ ...current, message: action === "ASSIGN_SELF" ? "Assigned to you." : "Intake updated.", error: "" }));
      await load();
    } catch (error) {
      setState((current) => ({ ...current, error: error?.message || "Unable to update intake" }));
    }
  }

  const grouped = useMemo(() => {
    const map = new Map();
    for (const assignment of state.assignments || []) {
      const key = assignment.destination_key || "UNKNOWN";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(assignment);
    }
    return [...map.entries()];
  }, [state.assignments]);

  return (
    <main className="min-h-screen bg-[#F7F6F3] p-5 text-[#1B1A18] lg:p-10">
      <div className="mx-auto max-w-7xl space-y-5">
        <section className="rounded-[30px] border border-black/[0.075] bg-white p-6 shadow-[0_14px_38px_rgba(55,47,38,0.05)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#D6A66A]"><Inbox className="h-4 w-4" /> Intelligent intake</div>
              <h1 className="mt-2 text-3xl font-black">Review routed staff uploads</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#817B73]">Avantiqo classifies uploads locally, routes them to the correct business destination, and keeps all financial, legal and operational mutations behind human review.</p>
            </div>
            <button onClick={load} disabled={state.loading} className="flex h-11 items-center gap-2 rounded-xl border border-black/[0.08] px-4 text-xs font-black uppercase tracking-[0.12em] text-[#67615A] disabled:opacity-40"><RefreshCw className={`h-4 w-4 ${state.loading ? "animate-spin" : ""}`} /> Refresh</button>
          </div>
        </section>

        {state.error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-[#984C43]">{state.error}</div> : null}
        {state.message ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-[#5E6D58]">{state.message}</div> : null}

        {!state.loading && !state.assignments.length ? (
          <section className="rounded-[28px] border border-black/[0.07] bg-white p-8 text-center">
            <ShieldCheck className="mx-auto h-8 w-8 text-[#D6A66A]" />
            <div className="mt-3 text-lg font-black">No intake waiting for review</div>
            <p className="mt-2 text-sm text-[#817B73]">New Camera uploads will appear here only when your role is authorized for their destination.</p>
          </section>
        ) : null}

        <div className="space-y-5">
          {grouped.map(([destination, assignments]) => (
            <section key={destination} className="rounded-[28px] border border-black/[0.075] bg-white p-5">
              <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#D6A66A]">{human(destination)}</div>
              <div className="mt-4 space-y-3">
                {assignments.map((item) => (
                  <article key={item.id} className="rounded-2xl border border-black/[0.06] bg-[#FCFBF9] p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-black">{human(item.workflow)}</span>
                          {item.urgency === "URGENT" ? <span className="rounded-full bg-red-50 px-2 py-1 text-[9px] font-black uppercase tracking-[0.1em] text-[#984C43]">Urgent</span> : null}
                          <span className="rounded-full bg-[#F4EEE5] px-2 py-1 text-[9px] font-black uppercase tracking-[0.1em] text-[#76583A]">{human(item.status)}</span>
                        </div>
                        <div className="mt-2 text-xs leading-5 text-[#817B73]">{item.suggested_action || "Review and route this upload."}</div>
                        {item.rationale ? <div className="mt-2 text-[10px] leading-4 text-[#948E86]">{item.rationale}</div> : null}
                        {item.universal_destination?.destination ? (
                          <div className="mt-3 rounded-xl border border-black/[0.06] bg-white p-3 text-[10px] leading-5 text-[#67615A]">
                            <div><span className="font-black">ERP destination:</span> {item.universal_destination.destination.label || item.universal_destination.destination.workspace_name || item.universal_destination.destination.domain || "Resolved destination"}</div>
                            {item.universal_destination.destination.route ? <div className="text-[#948E86]">{item.universal_destination.destination.route}</div> : null}
                          </div>
                        ) : null}
                        {item.business_match?.status && item.business_match.status !== "NO_MATCH" && item.business_match.status !== "NOT_SUPPORTED" ? (
                          <div className="mt-2 rounded-xl border border-black/[0.06] bg-white p-3 text-[10px] leading-5 text-[#67615A]">
                            <div><span className="font-black">Business match:</span> {human(item.business_match.status)}</div>
                            {item.business_match.candidates?.[0] ? <div className="text-[#948E86]">{item.business_match.candidates[0].record_type} · {item.business_match.candidates[0].label || "Matched record"}</div> : null}
                          </div>
                        ) : null}
                        <div className="mt-2 text-[10px] text-[#AAA49C]">{item.confidence != null ? `${Math.round(Number(item.confidence) * 100)}% confidence` : "Classification confidence unavailable"}{item.handoff_status ? ` · ${human(item.handoff_status)}` : ""}</div>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <a href={`/api/staff/intake/${item.id}/preview`} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center rounded-xl border border-black/[0.08] bg-white px-3 text-[10px] font-black uppercase tracking-[0.1em] text-[#67615A]">Preview</a>
                        {item.status === "ROUTING_APPROVED" ? (
                          <button onClick={() => act(item.id, "COMPLETE")} className="h-10 rounded-xl bg-[#D6A66A] px-3 text-[10px] font-black uppercase tracking-[0.1em] text-[#171614]">Mark handled</button>
                        ) : (
                          <>
                            <button onClick={() => act(item.id, "ASSIGN_SELF")} className="h-10 rounded-xl border border-black/[0.08] bg-white px-3 text-[10px] font-black uppercase tracking-[0.1em] text-[#67615A]">Assign to me</button>
                            <button onClick={() => act(item.id, "APPROVE_ROUTING")} className="h-10 rounded-xl bg-[#D6A66A] px-3 text-[10px] font-black uppercase tracking-[0.1em] text-[#171614]">Approve routing</button>
                            <button onClick={() => act(item.id, "REJECT")} className="h-10 rounded-xl border border-red-200 bg-red-50 px-3 text-[10px] font-black uppercase tracking-[0.1em] text-[#984C43]">Reject</button>
                          </>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
