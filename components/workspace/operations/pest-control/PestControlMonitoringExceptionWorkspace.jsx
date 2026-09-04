"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, CircleAlert, RefreshCw, ShieldAlert } from "lucide-react";

function tone(value) {
  return value === "critical"
    ? "border-[#B36B52]/25 bg-[#B36B52]/[0.06] text-[#8B4937]"
    : "border-[#D6A66A]/30 bg-[#D6A66A]/[0.07] text-[#76583A]";
}

function verificationCopy(state) {
  return ({
    work_not_created: ["Follow-up not created", "Start the corrective action, then create the governed follow-up work."],
    work_in_progress: ["Follow-up in progress", "Complete the linked work order before verification can begin."],
    check_required: ["Recheck required", "The work is complete. Perform a new governed monitoring check to prove the point is healthy."],
    failed: ["Recheck still failing", "The post-work check still shows an exception. Keep the corrective action open and intervene again."],
    ready: ["Ready to verify", "Follow-up work is complete and a newer governed monitoring check cleared the exception."],
    verified: ["Verified closed", "Closure is backed by post-work monitoring evidence."],
    completed_unverified: ["Completed without verification", "This action is not accepted as resolved until evidence-backed verification is present."],
  })[state] || ["Evidence pending", "Complete the governed corrective workflow before closure."];
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

  async function runAction(pointId, action) {
    setBusy(`${pointId}:${action}`);
    setMessage("");
    try {
      const response = await fetch("/api/service-management/monitoring-exceptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, action, pointId }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.error || "Monitoring exception action failed.");
      setMessage(action === "create_corrective_action"
        ? "Corrective action created. Assign and start it in Operations before follow-up work can be created."
        : action === "create_follow_up_work"
          ? "Follow-up work order created as a governed draft. Assign, release and execute it through Operations."
          : "Corrective action verified complete against the newer healthy monitoring check.");
      await load();
    } catch (error) {
      setMessage(error.message || "Monitoring exception action failed.");
    } finally {
      setBusy("");
    }
  }

  const rows = state.data?.rows || [];
  const metrics = state.data?.metrics || {};
  const workOrdersHref = `/workspace/${encodeURIComponent(organizationId)}/operations/work-orders`;
  const correctiveHref = `/workspace/${encodeURIComponent(organizationId)}/operations/corrective-actions`;
  const scanHref = `/workspace/${encodeURIComponent(organizationId)}/operations/field-service/monitoring-points/scan`;

  return (
    <main className="min-h-[calc(100vh-61px)] bg-[#F7F6F3] px-4 py-5 text-[#191919] md:px-8">
      <div className="mx-auto max-w-[1400px]">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-black/[0.07] pb-5">
          <div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-[#9A744B]">Pest Control</div>
            <h1 className="mt-1 text-[27px] font-medium tracking-[-0.04em]">Monitoring exceptions</h1>
            <p className="mt-1 max-w-3xl text-[11px] text-[#777169]">Turn governed field evidence into owned corrective work, then close the loop only after a newer healthy monitoring check proves the intervention worked.</p>
          </div>
          <button onClick={load} className="rounded-lg border border-black/[0.08] bg-white p-2" aria-label="Refresh monitoring exceptions"><RefreshCw size={12} className={state.loading ? "animate-spin" : ""} /></button>
        </header>

        {state.error ? <div className="mt-4 rounded-xl border border-[#B36B52]/20 bg-[#B36B52]/[0.05] p-3 text-[10px] text-[#8B4937]">{state.error}</div> : null}
        {message ? <div className="mt-4 rounded-xl border border-[#748267]/20 bg-[#748267]/[0.05] p-3 text-[10px] text-[#607057]">{message}</div> : null}

        <section className="mt-5 grid gap-3 md:grid-cols-4 xl:grid-cols-8">
          {[["Needs action", metrics.needs_action], ["Ownership", metrics.ownership_required], ["Work ready", metrics.follow_up_ready], ["Work open", metrics.work_open], ["Verify", metrics.verification_required], ["Ready close", metrics.ready_to_close], ["Critical", metrics.critical], ["Resolved", metrics.resolved_recent]].map(([label, value]) => <div key={label} className="rounded-2xl border border-black/[0.07] bg-white p-4"><div className="text-[8px] uppercase tracking-[0.1em] text-[#948D84]">{label}</div><div className="mt-2 text-[22px]">{value || 0}</div></div>)}
        </section>

        <section className="mt-5 space-y-3">
          {rows.map((row) => {
            const corrective = row.active_action;
            const workOrder = corrective?.follow_up_work_order;
            const verification = corrective?.verification;
            const [verificationLabel, verificationDetail] = verificationCopy(verification?.state);
            const actionStarted = corrective?.status === "in_progress";
            return (
              <article key={row.point_id} className="rounded-2xl border border-black/[0.07] bg-white p-5">
                <div className="flex flex-wrap justify-between gap-3">
                  <div>
                    <div className="text-[12px] font-medium">{row.point_code}</div>
                    <div className="mt-1 text-[9px] text-[#8C857C]">{row.customer_name} · {row.customer_location_name} · {row.area || "Area unknown"}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {row.current_exception ? <span className="rounded-full border border-[#B36B52]/20 bg-[#B36B52]/[0.04] px-3 py-1 text-[8px] uppercase text-[#8B4937]">Signal active</span> : <span className="rounded-full border border-[#748267]/20 bg-[#748267]/[0.04] px-3 py-1 text-[8px] uppercase text-[#607057]">Signal cleared</span>}
                    <span className={`rounded-full border px-3 py-1 text-[8px] uppercase ${tone(row.severity)}`}>{row.severity}</span>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
                  <div className="space-y-3">
                    <div className="rounded-xl bg-[#FBFAF8] p-4 text-[10px] leading-5 text-[#655F57]">
                      <ShieldAlert size={12} className="mr-2 inline" />{row.recommendation}
                      <div className="mt-2 text-[8px] text-[#908980]">Signals: {row.signals.join(", ") || "historical corrective action"} · Repeat streak: {row.repeat_streak} · Trigger: {row.trigger_check_id}</div>
                    </div>

                    {corrective ? (
                      <div className={`rounded-xl border p-4 ${verification?.state === "ready" ? "border-[#748267]/20 bg-[#748267]/[0.05]" : verification?.state === "failed" || verification?.state === "completed_unverified" ? "border-[#B36B52]/20 bg-[#B36B52]/[0.04]" : "border-black/[0.06] bg-white"}`}>
                        <div className="flex items-center gap-2 text-[9px] font-medium text-[#514B44]">{verification?.state === "ready" ? <CheckCircle2 size={12} /> : <CircleAlert size={12} />}{verificationLabel}</div>
                        <div className="mt-1 text-[9px] leading-4 text-[#817A72]">{verificationDetail}</div>
                        {verification?.post_work_check ? <div className="mt-2 text-[8px] text-[#918A81]">Post-work check {verification.post_work_check.id} · condition {verification.post_work_check.condition || "unknown"} · activity {verification.post_work_check.activity_level || "none"}</div> : null}
                        {verification?.post_work_signals?.length ? <div className="mt-1 text-[8px] text-[#8B4937]">Still detected: {verification.post_work_signals.join(", ")}</div> : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    {!corrective ? (
                      <button disabled={busy === `${row.point_id}:create_corrective_action`} onClick={() => runAction(row.point_id, "create_corrective_action")} className="w-full rounded-xl bg-[#2C2925] px-4 py-3 text-[9px] text-white disabled:opacity-40">{busy === `${row.point_id}:create_corrective_action` ? "Creating…" : "Create corrective action"}</button>
                    ) : (
                      <div className="rounded-xl border border-black/[0.06] bg-[#FBFAF8] p-3.5">
                        <div className="flex items-center justify-between gap-2 text-[9px]"><span className="font-medium text-[#514B44]">Corrective action</span><span className="text-[#7B746C]">{corrective.status}</span></div>
                        <div className="mt-1 text-[8px] text-[#918A81]">Due {corrective.due_at ? new Date(corrective.due_at).toLocaleString() : "not set"}</div>
                        <Link href={correctiveHref} className="mt-2 inline-flex items-center gap-1 text-[8px] font-medium text-[#6B5947]">Assign / start action <ArrowRight size={9} /></Link>
                      </div>
                    )}

                    {corrective && !workOrder && actionStarted ? (
                      <button disabled={busy === `${row.point_id}:create_follow_up_work`} onClick={() => runAction(row.point_id, "create_follow_up_work")} className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#D6A66A]/30 bg-[#D6A66A]/[0.07] px-4 py-3 text-[9px] font-medium text-[#76583A] disabled:opacity-40">{busy === `${row.point_id}:create_follow_up_work` ? "Creating…" : "Create follow-up work"}<ArrowRight size={10} /></button>
                    ) : null}

                    {corrective && !workOrder && !actionStarted ? <div className="rounded-xl border border-black/[0.06] bg-white p-3 text-[8px] leading-4 text-[#817A72]">Start the corrective action in Operations before creating follow-up work.</div> : null}

                    {workOrder ? (
                      <div className="rounded-xl border border-[#748267]/18 bg-[#748267]/[0.04] p-3.5">
                        <div className="flex items-center justify-between gap-2 text-[9px]"><span className="font-medium text-[#607057]">Follow-up work</span><span className="text-[#607057]">{workOrder.status}</span></div>
                        <div className="mt-1 text-[8px] text-[#7F8878]">Governed by normal assignment, release, execution and completion controls.</div>
                        <Link href={workOrdersHref} className="mt-2 inline-flex items-center gap-1 text-[8px] font-medium text-[#6B5947]">Open work orders <ArrowRight size={9} /></Link>
                      </div>
                    ) : null}

                    {verification?.state === "check_required" || verification?.state === "failed" ? <Link href={scanHref} className="flex w-full items-center justify-center gap-2 rounded-xl border border-black/[0.07] bg-white px-4 py-3 text-[9px] font-medium text-[#514B44]">Perform governed recheck <ArrowRight size={10} /></Link> : null}

                    {verification?.can_verify ? <button disabled={busy === `${row.point_id}:verify_corrective_action`} onClick={() => runAction(row.point_id, "verify_corrective_action")} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#607057] px-4 py-3 text-[9px] font-medium text-white disabled:opacity-40">{busy === `${row.point_id}:verify_corrective_action` ? "Verifying…" : "Verify corrective closure"}<CheckCircle2 size={11} /></button> : null}
                  </div>
                </div>
              </article>
            );
          })}
          {!state.loading && !rows.length ? <div className="rounded-2xl border border-black/[0.07] bg-white p-10 text-center text-[10px] text-[#817A72]"><CheckCircle2 className="mx-auto mb-2" />No active monitoring exceptions.</div> : null}
        </section>
      </div>
    </main>
  );
}
