"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileCheck2, RefreshCw, ShieldAlert } from "lucide-react";

const SEVERITIES = [
  ["low", "Low"],
  ["medium", "Medium"],
  ["high", "High"],
  ["critical", "Critical"],
];

const NEXT_ACTIONS = [
  ["monitor", "Monitor"],
  ["revisit", "Revisit"],
  ["remediate", "Remediate"],
  ["quote", "Prepare quote"],
  ["escalate", "Escalate"],
  ["customer_action", "Customer action"],
];

function text(value) {
  return String(value ?? "").trim();
}

function label(value) {
  return text(value).replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function PestControlVisitExceptionCard({ organizationId, occurrenceId, workOrderId }) {
  const [state, setState] = useState({ loading: false, error: "", record: null });
  const [outcome, setOutcome] = useState("issue_found");
  const [severity, setSeverity] = useState("medium");
  const [nextAction, setNextAction] = useState("revisit");
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!organizationId || !occurrenceId) {
      setState({ loading: false, error: "", record: null });
      return;
    }
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const params = new URLSearchParams({ organizationId, occurrenceId });
      if (workOrderId) params.set("workOrderId", workOrderId);
      const response = await fetch(`/api/service-management/visit-exception?${params.toString()}`, {
        cache: "no-store",
        credentials: "include",
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.error || "Site exception could not be loaded.");
      const record = json.service_exception || null;
      setState({ loading: false, error: "", record });
      if (record?.active) {
        setOutcome(record.outcome || "issue_found");
        setSeverity(record.severity || "medium");
        setNextAction(record.next_action || "revisit");
        setSummary(record.summary || "");
      } else {
        setOutcome("issue_found");
        setSeverity("medium");
        setNextAction("revisit");
        setSummary("");
      }
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error?.message || "Site exception could not be loaded." }));
    }
  }, [occurrenceId, organizationId, workOrderId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (typeof window === "undefined" || !occurrenceId) return undefined;
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load, occurrenceId]);

  const record = state.record;
  const canEdit = Boolean(record?.visit_started && !record?.visit_terminal);
  const draftReady = summary.trim().length >= 8 && severity && nextAction && outcome;
  const proofHref = occurrenceId
    ? `/workspace/${encodeURIComponent(organizationId)}/operations/completion-evidence/${encodeURIComponent(occurrenceId)}`
    : "#";
  const readiness = useMemo(() => {
    if (!record?.active) return { label: "No exception recorded", ready: true };
    if (!record.fields_ready) return { label: "Details incomplete", ready: false };
    if (!record.evidence_ready) return { label: "Evidence required", ready: false };
    return { label: "Ready for governed follow-up", ready: true };
  }, [record]);

  async function save(action) {
    if (!organizationId || !occurrenceId || busy) return;
    setBusy(action);
    setNotice("");
    try {
      const response = await fetch("/api/service-management/visit-exception", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          occurrenceId,
          workOrderId: workOrderId || null,
          action,
          outcome,
          severity,
          nextAction,
          summary,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.error || "Site exception could not be saved.");
      setState({ loading: false, error: "", record: json.service_exception || null });
      setNotice(action === "clear"
        ? "Exception cleared. The visit can close as completed when all other gates are ready."
        : json.service_exception?.evidence_ready
          ? "Exception saved with governed proof. Completion will create the linked follow-up automatically."
          : "Exception saved. Capture governed evidence before completing the visit.");
      if (action === "clear") {
        setOutcome("issue_found");
        setSeverity("medium");
        setNextAction("revisit");
        setSummary("");
      }
    } catch (error) {
      setNotice(error?.message || "Site exception could not be saved.");
    } finally {
      setBusy("");
    }
  }

  if (!occurrenceId) return null;

  return (
    <section className="mx-auto mt-4 max-w-[1680px] px-4 md:px-7 lg:px-9">
      <div className={`rounded-2xl border bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.025)] ${record?.active ? "border-[#C08A4A]/25" : "border-black/[0.075]"}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 gap-3">
            <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${record?.active ? "bg-[#C08A4A]/10 text-[#8A6039]" : "bg-[#F4F2EE] text-[#777169]"}`}>
              <ShieldAlert size={14} />
            </div>
            <div>
              <div className="text-[9px] font-medium uppercase tracking-[0.13em] text-[#9A744B]">Site exception</div>
              <h2 className="mt-0.5 text-[15px] font-medium text-[#322E29]">Issue → evidence → next action</h2>
              <p className="mt-1 max-w-3xl text-[9px] leading-4 text-[#817A72]">Record an exception once. Avantiqo binds it to this exact visit and uses it as the completion outcome, then reconciliation creates the linked follow-up work automatically.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full border px-2.5 py-1.5 text-[8px] font-medium ${readiness.ready ? "border-[#748267]/18 bg-[#748267]/[0.05] text-[#607057]" : "border-[#B36B52]/20 bg-[#B36B52]/[0.05] text-[#8B4937]"}`}>{readiness.label}</span>
            <button type="button" onClick={load} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-black/[0.08] bg-white text-[#806143]" aria-label="Refresh site exception"><RefreshCw size={11} className={state.loading ? "animate-spin" : ""} /></button>
          </div>
        </div>

        {state.error ? <div className="mt-3 flex items-start gap-2 rounded-xl border border-[#B36B52]/20 bg-[#B36B52]/[0.05] px-3 py-2.5 text-[9px] text-[#8B4937]"><AlertTriangle size={11} className="mt-0.5 shrink-0" />{state.error}</div> : null}

        <div className="mt-4 grid gap-3 lg:grid-cols-[150px_150px_190px_minmax(260px,1fr)_auto]">
          <label className="rounded-xl border border-black/[0.06] bg-[#FBFAF8] p-3"><span className="text-[8px] font-medium text-[#5B554E]">Outcome</span><select disabled={!canEdit} value={outcome} onChange={(event) => setOutcome(event.target.value)} className="mt-1.5 w-full rounded-lg border border-black/[0.08] bg-white px-2.5 py-2 text-[10px] disabled:bg-[#F1EFEA]"><option value="issue_found">Issue found</option><option value="follow_up">Follow-up needed</option></select></label>
          <label className="rounded-xl border border-black/[0.06] bg-[#FBFAF8] p-3"><span className="text-[8px] font-medium text-[#5B554E]">Severity</span><select disabled={!canEdit} value={severity} onChange={(event) => setSeverity(event.target.value)} className="mt-1.5 w-full rounded-lg border border-black/[0.08] bg-white px-2.5 py-2 text-[10px] disabled:bg-[#F1EFEA]">{SEVERITIES.map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
          <label className="rounded-xl border border-black/[0.06] bg-[#FBFAF8] p-3"><span className="text-[8px] font-medium text-[#5B554E]">Next action</span><select disabled={!canEdit} value={nextAction} onChange={(event) => setNextAction(event.target.value)} className="mt-1.5 w-full rounded-lg border border-black/[0.08] bg-white px-2.5 py-2 text-[10px] disabled:bg-[#F1EFEA]">{NEXT_ACTIONS.map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
          <label className={`rounded-xl border p-3 ${record?.active && !record.fields_ready ? "border-[#C08A4A]/25 bg-[#C08A4A]/[0.035]" : "border-black/[0.06] bg-[#FBFAF8]"}`}><span className="text-[8px] font-medium text-[#5B554E]">What happened / what must happen next</span><input disabled={!canEdit} value={summary} onChange={(event) => setSummary(event.target.value)} className="mt-1.5 w-full rounded-lg border border-black/[0.08] bg-white px-2.5 py-2 text-[10px] disabled:bg-[#F1EFEA]" placeholder="Example: Active termite trail at rear store; revisit and treat entry point." /></label>
          <div className="flex min-w-[150px] flex-col justify-end gap-2">{record?.active ? <button type="button" disabled={!canEdit || busy === "clear"} onClick={() => save("clear")} className="rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-[9px] font-medium text-[#746D65] disabled:opacity-40">{busy === "clear" ? "Clearing…" : "Clear exception"}</button> : null}<button type="button" disabled={!canEdit || !draftReady || busy === "record"} onClick={() => save("record")} className="rounded-lg bg-[#2C2925] px-3 py-2.5 text-[9px] font-medium text-white disabled:opacity-35">{busy === "record" ? "Saving…" : record?.active ? "Update exception" : "Record exception"}</button></div>
        </div>

        {!record?.visit_started && !record?.visit_terminal ? <div className="mt-3 text-[8px] text-[#98513D]">Confirm arrival before recording a site exception.</div> : null}
        {record?.visit_terminal ? <div className="mt-3 text-[8px] text-[#777169]">This visit is complete. The exception snapshot is locked with the service history.</div> : null}

        {record?.active ? <div className="mt-3 grid gap-2 sm:grid-cols-4"><div className="rounded-xl bg-[#FBFAF8] px-3 py-2.5"><div className="text-[7px] uppercase tracking-[0.08em] text-[#99938B]">Severity</div><div className="mt-1 text-[9px] font-medium text-[#4F4942]">{label(record.severity)}</div></div><div className="rounded-xl bg-[#FBFAF8] px-3 py-2.5"><div className="text-[7px] uppercase tracking-[0.08em] text-[#99938B]">Action</div><div className="mt-1 text-[9px] font-medium text-[#4F4942]">{label(record.next_action)}</div></div><div className="rounded-xl bg-[#FBFAF8] px-3 py-2.5"><div className="text-[7px] uppercase tracking-[0.08em] text-[#99938B]">Governed proof</div><div className={`mt-1 flex items-center gap-1 text-[9px] font-medium ${record.evidence_ready ? "text-[#607057]" : "text-[#98513D]"}`}>{record.evidence_ready ? <CheckCircle2 size={9} /> : <FileCheck2 size={9} />}{record.evidence_ready ? "Bound to visit" : "Required"}</div></div><div className="rounded-xl bg-[#FBFAF8] px-3 py-2.5"><div className="text-[7px] uppercase tracking-[0.08em] text-[#99938B]">Manager review</div><div className="mt-1 text-[9px] font-medium text-[#4F4942]">{record.requires_manager_review ? "Required" : "Normal flow"}</div></div></div> : null}

        {record?.active && !record.evidence_ready ? <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#C08A4A]/20 bg-[#C08A4A]/[0.035] px-3.5 py-3"><div className="text-[9px] leading-4 text-[#76583A]">The issue is saved, but completion stays locked until occurrence-bound proof is ready.</div><a href={proofHref} className="rounded-lg border border-[#C08A4A]/20 bg-white px-3 py-2 text-[9px] font-medium text-[#76583A]">Capture evidence</a></div> : null}
        {notice ? <div className={`mt-3 rounded-xl border px-3.5 py-3 text-[9px] leading-4 ${notice.toLowerCase().includes("could") || notice.toLowerCase().includes("required") || notice.toLowerCase().includes("cannot") ? "border-[#B36B52]/20 bg-[#B36B52]/[0.05] text-[#8B4937]" : "border-[#748267]/18 bg-[#748267]/[0.05] text-[#607057]"}`}>{notice}</div> : null}
      </div>
    </section>
  );
}