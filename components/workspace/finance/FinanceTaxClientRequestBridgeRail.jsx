"use client";

import { useEffect, useState } from "react";
import { Link2, RefreshCw, ShieldCheck, Unlink2, Users } from "lucide-react";

function clean(value) {
  return String(value ?? "").trim();
}

function date(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(parsed);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, { credentials: "include", cache: "no-store", ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.success === false) throw new Error(body?.error || `Request failed (${response.status})`);
  return body;
}

export default function FinanceTaxClientRequestBridgeRail({ organizationId, entityId, selectedVatReturnId }) {
  const [state, setState] = useState({ loading: false, error: "", dependencyCode: "", body: null });
  const [selectedRequestId, setSelectedRequestId] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!organizationId || !entityId || !selectedVatReturnId) {
      setState({ loading: false, error: "", dependencyCode: "", body: null });
      return;
    }
    try {
      setState(current => ({ ...current, loading: true, error: "" }));
      const workUrl = new URL("/api/finance/vat-returns/dependency-work", window.location.origin);
      workUrl.searchParams.set("organizationId", organizationId);
      workUrl.searchParams.set("entityId", entityId);
      workUrl.searchParams.set("vatReturnId", selectedVatReturnId);
      const work = await requestJson(workUrl.toString());
      if (work.return_id !== selectedVatReturnId) throw new Error("Tax client evidence resolved a different VAT filing. Refresh Tax before continuing.");
      const dependency = (work.guidance?.dependencies || []).find(item => item.client_request_recommended === true && item.responsibility === "CLIENT_EVIDENCE_ACCOUNTANT_VALIDATION");
      if (!dependency) {
        setState({ loading: false, error: "", dependencyCode: "", body: null });
        setSelectedRequestId("");
        return;
      }
      const url = new URL("/api/finance/vat-returns/dependency-client-request", window.location.origin);
      url.searchParams.set("organizationId", organizationId);
      url.searchParams.set("entityId", entityId);
      url.searchParams.set("vatReturnId", selectedVatReturnId);
      url.searchParams.set("dependencyCode", dependency.code);
      const body = await requestJson(url.toString());
      if (body.return_id !== selectedVatReturnId || body.dependency?.code !== dependency.code) throw new Error("Tax client request bridge did not match the selected filing dependency.");
      setState({ loading: false, error: "", dependencyCode: dependency.code, body });
      setSelectedRequestId(body.linked_request?.id || "");
    } catch (error) {
      setState({ loading: false, error: error?.message || "Tax client request bridge could not be loaded", dependencyCode: "", body: null });
    }
  }

  useEffect(() => { load(); }, [organizationId, entityId, selectedVatReturnId]);

  async function patch(action, clientRequestId = null) {
    if (!state.dependencyCode) return;
    try {
      setBusy(true);
      setState(current => ({ ...current, error: "" }));
      await requestJson("/api/finance/vat-returns/dependency-client-request", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          entityId,
          vatReturnId: selectedVatReturnId,
          dependencyCode: state.dependencyCode,
          action,
          clientRequestId,
        }),
      });
      await load();
    } catch (error) {
      setState(current => ({ ...current, error: error?.message || "Tax client request link could not be updated" }));
    } finally {
      setBusy(false);
    }
  }

  if (!organizationId || !entityId || !selectedVatReturnId) return null;
  if (!state.loading && !state.error && !state.body) return null;

  const body = state.body;
  const linked = body?.linked_request || null;
  const candidates = body?.candidate_requests || [];
  const dependency = body?.dependency || null;

  return <section className="mx-auto mt-3 max-w-[1760px] px-4 sm:px-5 lg:px-6">
    <div className="overflow-hidden rounded-xl border border-black/[0.07] bg-white text-[#2A2723]">
      <div className="flex flex-col gap-3 border-b border-black/[0.07] p-3.5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.15em] text-[#9A7045]"><Users size={11} /> Client evidence bridge</div>
          <div className="mt-1 text-[12px] font-semibold">Link Tax to a real client request without inventing workflow.</div>
          <div className="mt-1 max-w-4xl text-[9px] leading-4 text-[#817B73]">Only client requests that already belong to a governed accounting engagement for this exact legal entity appear here. Tax cannot create or send a request from this rail, and request acceptance never clears the VAT blocker by itself.</div>
        </div>
        <button onClick={load} className="inline-flex h-8 items-center gap-1.5 self-start rounded-lg border border-black/[0.09] bg-white px-2.5 text-[9px] font-semibold"><RefreshCw size={10} className={state.loading ? "animate-spin" : ""} /> Refresh</button>
      </div>

      {state.error ? <div className="m-3 rounded-lg border border-red-700/15 bg-red-50 p-2.5 text-[9px] text-red-800">{state.error}</div> : null}
      {state.loading && !body ? <div className="p-4 text-[9px] text-[#817B73]">Reading governed client requests…</div> : null}

      {body && dependency ? <>
        <div className="grid gap-px border-b border-black/[0.07] bg-black/[0.05] lg:grid-cols-[1.1fr_1fr_1fr]">
          <div className="bg-[#FAF9F7] p-3"><div className="text-[8px] uppercase tracking-[0.08em] text-[#968F87]">Live Tax dependency</div><div className="mt-1 text-[10px] font-semibold">{dependency.title}</div><div className="mt-1 text-[8px] text-[#817B73]">{dependency.resolution_rule}</div></div>
          <div className="bg-[#FAF9F7] p-3"><div className="text-[8px] uppercase tracking-[0.08em] text-[#968F87]">Linked client request</div><div className="mt-1 text-[10px] font-semibold">{linked ? linked.title : "None"}</div><div className="mt-1 text-[8px] text-[#817B73]">{linked ? `${linked.status} · due ${date(linked.due_at)}` : "No authentic engagement request is linked yet."}</div></div>
          <div className="bg-[#FAF9F7] p-3"><div className="text-[8px] uppercase tracking-[0.08em] text-[#968F87]">Resolution authority</div><div className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-[#4E4943]"><ShieldCheck size={10} /> Live Tax preflight only</div><div className="mt-1 text-[8px] text-[#817B73]">Client request status is coordination evidence, not accounting truth.</div></div>
        </div>

        <div className="p-3.5">
          {linked ? <div className="flex flex-col gap-3 rounded-lg border border-emerald-700/12 bg-emerald-50/50 p-3 lg:flex-row lg:items-center lg:justify-between"><div><div className="inline-flex items-center gap-1.5 text-[9px] font-semibold text-emerald-800"><Link2 size={10} /> Authentic request linked</div><div className="mt-1 text-[9px] text-[#5F5952]">{linked.title} · {linked.status} · engagement work item {String(linked.work_item_id).slice(0, 8)}…</div><div className="mt-1 text-[8px] text-[#817B73]">Even if the client submits or the accountant accepts this request, the Tax dependency stays open until the registration evidence is validated in Finance.</div></div><button onClick={() => patch("UNLINK")} disabled={busy} className="inline-flex h-8 items-center gap-1.5 self-start rounded-lg border border-black/[0.09] bg-white px-2.5 text-[8px] font-semibold disabled:opacity-40"><Unlink2 size={9} /> Unlink</button></div> : <>
            {candidates.length ? <div className="grid gap-2 lg:grid-cols-[minmax(280px,1fr)_auto] lg:items-end"><label className="text-[8px] font-semibold uppercase tracking-[0.08em] text-[#817B73]">Existing governed client request<select value={selectedRequestId} onChange={event => setSelectedRequestId(event.target.value)} className="mt-1.5 h-9 w-full rounded-lg border border-black/[0.09] bg-white px-2.5 text-[9px] font-normal normal-case tracking-normal"><option value="">Select authentic request</option>{candidates.map(request => <option key={request.id} value={request.id}>{request.title} · {request.status}{request.due_at ? ` · due ${date(request.due_at)}` : ""}</option>)}</select></label><button onClick={() => patch("LINK", selectedRequestId)} disabled={busy || !clean(selectedRequestId)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#1F1E1B] px-3 text-[8px] font-semibold text-white disabled:opacity-40"><Link2 size={9} /> Link request</button></div> : <div className="rounded-lg border border-amber-700/15 bg-amber-50 p-3 text-[9px] leading-4 text-amber-900"><b>No authentic request exists for this legal entity.</b> Create the client request through the governed Accounting engagement workflow. Tax will discover it here automatically; this rail deliberately does not manufacture an engagement run or work item.</div>}
          </>}
        </div>

        <div className="border-t border-black/[0.07] bg-[#FAF9F7] px-3.5 py-2.5 text-[8px] leading-4 text-[#817B73]">Request creation supported here: no · automatic send supported here: no · Tax resolution authority: live preflight only.</div>
      </> : null}
    </div>
  </section>;
}
