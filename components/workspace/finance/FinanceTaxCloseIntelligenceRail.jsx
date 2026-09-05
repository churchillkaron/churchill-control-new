"use client";

import { useEffect, useState } from "react";
import { BrainCircuit, RefreshCw, ShieldCheck, Sparkles, TriangleAlert } from "lucide-react";

async function requestJson(url, options = {}) {
  const response = await fetch(url, { credentials: "include", cache: "no-store", ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.success === false) throw new Error(body?.error || `Request failed (${response.status})`);
  return body;
}

function sourceLabel(value) {
  return value === "OWNED_INTELLIGENCE" ? "Avantiqo owned intelligence" : "Deterministic fallback";
}

export default function FinanceTaxCloseIntelligenceRail({ organizationId, entityId, selectedVatReturnId }) {
  const [state, setState] = useState({ loading: false, error: "", body: null });

  useEffect(() => {
    setState({ loading: false, error: "", body: null });
  }, [organizationId, entityId, selectedVatReturnId]);

  async function generate() {
    if (!organizationId || !entityId || !selectedVatReturnId || state.loading) return;
    try {
      setState(current => ({ ...current, loading: true, error: "" }));
      const body = await requestJson("/api/finance/vat-returns/close-intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, entityId, vatReturnId: selectedVatReturnId }),
      });
      if (body.return_id !== selectedVatReturnId) throw new Error("Tax close intelligence returned a different filing. Refresh Tax before continuing.");
      if (body.resolution_authority !== "LIVE_TAX_PREFLIGHT_ONLY") throw new Error("Tax close intelligence did not preserve live-preflight resolution authority.");
      if (body.mutation_authority !== false || body.communication_authority !== false || body.filing_authority !== false) {
        throw new Error("Tax close intelligence returned unsafe execution authority.");
      }
      setState({ loading: false, error: "", body });
    } catch (error) {
      setState({ loading: false, error: error?.message || "Tax close intelligence could not be generated", body: null });
    }
  }

  if (!organizationId || !entityId || !selectedVatReturnId) return null;

  const body = state.body;
  const brief = body?.brief || null;

  return <section className="mx-auto mt-3 max-w-[1760px] px-4 sm:px-5 lg:px-6">
    <div className="overflow-hidden rounded-xl border border-black/[0.07] bg-white text-[#2A2723]">
      <div className="flex flex-col gap-3 border-b border-black/[0.07] p-3.5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.15em] text-[#9A7045]"><BrainCircuit size={11} /> Tax close intelligence</span>
            <span className="rounded-md border border-black/[0.07] bg-[#F7F6F3] px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.07em] text-[#716B63]">Advisory only</span>
            {body ? <span className="rounded-md border border-emerald-700/15 bg-emerald-50 px-2 py-1 text-[7px] font-semibold text-emerald-800">{sourceLabel(body.source)}</span> : null}
          </div>
          <div className="mt-1 text-[12px] font-semibold">Explain live Tax blockers without changing accounting truth.</div>
          <div className="mt-1 max-w-4xl text-[9px] leading-4 text-[#817B73]">Avantiqo rebuilds the filing's governed Tax evidence first, then uses owned Intelligence only to explain and prioritize it. AI cannot file, post, send client communication, edit source evidence or complete a dependency.</div>
        </div>
        <button type="button" onClick={generate} disabled={state.loading} className="inline-flex h-8 items-center gap-1.5 self-start rounded-lg bg-[#1F1E1B] px-3 text-[9px] font-semibold text-white disabled:opacity-40">
          {state.loading ? <RefreshCw size={10} className="animate-spin" /> : <Sparkles size={10} />}
          {state.loading ? "Rebuilding live evidence…" : body ? "Regenerate brief" : "Generate governed brief"}
        </button>
      </div>

      {state.error ? <div className="m-3 rounded-lg border border-red-700/15 bg-red-50 p-2.5 text-[9px] text-red-800">{state.error}</div> : null}

      {!brief && !state.error ? <div className="flex items-start gap-2 p-3.5 text-[9px] leading-4 text-[#817B73]"><ShieldCheck size={12} className="mt-0.5 shrink-0 text-[#9A7045]" /><div>Generation is deliberate rather than automatic. The brief is produced from the current filing only and is discarded when the selected filing changes.</div></div> : null}

      {brief ? <>
        <div className="grid gap-px border-b border-black/[0.07] bg-black/[0.05] lg:grid-cols-3">
          <div className="bg-[#FAF9F7] p-3"><div className="text-[8px] uppercase tracking-[0.08em] text-[#968F87]">Close assessment</div><div className="mt-1 text-[10px] font-semibold leading-4">{brief.summary}</div></div>
          <div className="bg-[#FAF9F7] p-3"><div className="text-[8px] uppercase tracking-[0.08em] text-[#968F87]">Statutory risk</div><div className="mt-1 text-[9px] leading-4 text-[#4E4943]">{brief.risk_summary}</div></div>
          <div className="bg-[#FAF9F7] p-3"><div className="text-[8px] uppercase tracking-[0.08em] text-[#968F87]">Resolution authority</div><div className="mt-1 text-[10px] font-semibold">Live Tax preflight only</div><div className="mt-0.5 text-[8px] text-[#918B83]">AI is explanation, never clearance.</div></div>
        </div>

        {brief.recommended_next_step ? <div className="border-b border-black/[0.07] p-3.5">
          <div className="text-[8px] font-semibold uppercase tracking-[0.09em] text-[#9A7045]">Recommended next accountant action</div>
          <div className="mt-1.5 text-[11px] font-semibold">{brief.recommended_next_step.action}</div>
          <div className="mt-1 text-[9px] leading-4 text-[#716B63]">{brief.recommended_next_step.why_now}</div>
          <div className="mt-2 rounded-lg border border-black/[0.06] bg-[#FAF9F7] p-2.5"><div className="text-[8px] font-semibold uppercase tracking-[0.08em] text-[#8A837B]">Proof required before this blocker disappears</div><div className="mt-1 text-[9px] leading-4 text-[#4E4943]">{brief.recommended_next_step.verification}</div></div>
        </div> : null}

        {brief.blocking_dependencies?.length ? <div className="divide-y divide-black/[0.06]">{brief.blocking_dependencies.map(item => <div key={item.code} className="p-3.5">
          <div className="flex flex-wrap items-center gap-2"><span className={`rounded-md border px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.07em] ${item.blocking ? "border-red-700/15 bg-red-50 text-red-800" : "border-amber-700/15 bg-amber-50 text-amber-900"}`}>{item.blocking ? "Blocks filing" : "Review"}</span><span className="text-[8px] text-[#918B83]">{item.code}</span></div>
          <div className="mt-1.5 text-[10px] font-semibold">{item.title}</div>
          <div className="mt-1 text-[9px] leading-4 text-[#716B63]">{item.explanation}</div>
          <div className="mt-2 grid gap-2 lg:grid-cols-2"><div className="rounded-lg border border-black/[0.06] bg-[#FAF9F7] p-2.5"><div className="text-[8px] font-semibold uppercase tracking-[0.08em] text-[#8A837B]">Evidence summary</div><div className="mt-1 text-[9px] leading-4 text-[#4E4943]">{item.evidence_summary}</div></div><div className="rounded-lg border border-black/[0.06] bg-[#FAF9F7] p-2.5"><div className="text-[8px] font-semibold uppercase tracking-[0.08em] text-[#8A837B]">Deterministic resolution proof</div><div className="mt-1 text-[9px] leading-4 text-[#4E4943]">{item.resolution_proof}</div></div></div>
        </div>)}</div> : null}

        {brief.uncertainties?.length ? <div className="border-t border-amber-700/10 bg-amber-50/50 p-3.5"><div className="inline-flex items-center gap-1 text-[8px] font-semibold uppercase tracking-[0.08em] text-amber-900"><TriangleAlert size={10} /> Uncertainty / fallback</div>{brief.uncertainties.map((item, index) => <div key={index} className="mt-1 text-[8px] leading-4 text-amber-900">{item}</div>)}</div> : null}

        <div className="border-t border-black/[0.07] bg-[#FAF9F7] px-3.5 py-2.5 text-[8px] leading-4 text-[#817B73]">Evidence fingerprint <span className="font-mono">{body.source_fingerprint?.slice(0, 16)}…</span> · Generated {body.generated_at ? new Date(body.generated_at).toLocaleString() : "now"}. No mutation, communication or filing authority is exposed by this surface.</div>
      </> : null}
    </div>
  </section>;
}
