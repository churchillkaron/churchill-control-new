"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Film,
  Loader2,
  RadioTower,
  RefreshCw,
  Send,
  ShieldCheck,
  Waypoints,
} from "lucide-react";

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function duration(value) {
  const seconds = finite(value);
  if (seconds === null) return "—";
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds - minutes * 60);
  return minutes ? `${minutes}:${String(remainder).padStart(2, "0")}` : `${seconds.toFixed(1)}s`;
}

function label(value) {
  return String(value || "—").replaceAll("_", " ");
}

function statusTone(value = "") {
  const status = String(value).toUpperCase();
  if (["PUBLISHED", "APPROVED", "READY"].includes(status)) {
    return "border-emerald-700/15 bg-emerald-50 text-emerald-800";
  }
  if ([
    "PENDING_CONNECTOR",
    "PENDING_PROVIDER",
    "DISPATCHING",
    "REMOTE_ACKNOWLEDGED",
    "REMOTE_ACKNOWLEDGED_LEGACY",
    "REMOTE_VERIFICATION_REQUIRED",
    "REVIEW",
  ].includes(status)) {
    return "border-amber-700/15 bg-amber-50 text-amber-800";
  }
  if (["FAILED", "EVIDENCE_REQUIRED", "REJECTED"].includes(status)) {
    return "border-red-700/15 bg-red-50 text-red-800";
  }
  return "border-black/[0.08] bg-[#F5F3EF] text-[#777067]";
}

function Evidence({ passed, children }) {
  return (
    <div className="flex items-start gap-2">
      {passed ? (
        <CheckCircle2 size={11} className="mt-0.5 shrink-0 text-emerald-700" />
      ) : (
        <AlertTriangle size={11} className="mt-0.5 shrink-0 text-amber-700" />
      )}
      <span className="text-[8px] leading-4 text-[#69635C]">{children}</span>
    </div>
  );
}

export default function PublishingWorkspace({ runtime, editor }) {
  const project = runtime.projectRuntime?.current || null;
  const [publishing, setPublishing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const inspect = useCallback(async ({ quiet = false } = {}) => {
    if (!runtime.organizationId || !project?.id) return;
    if (!quiet) setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/creative/release/inspect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organization_id: runtime.organizationId,
          creative_project_id: project.id,
        }),
      });
      const result = await response.json();
      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Publishing inspection failed");
      }
      setPublishing(result.publishing || null);
    } catch (inspectError) {
      setError(inspectError.message || "Publishing inspection failed");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [runtime.organizationId, project?.id]);

  useEffect(() => {
    inspect();
  }, [inspect]);

  async function approvePublication() {
    const readinessId = publishing?.release?.readiness?.id;
    if (!readinessId || working) return;
    setWorking("approve-release");
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/creative/release/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organization_id: runtime.organizationId,
          subject_asset_node_id: readinessId,
          scope: "PUBLISH_RELEASE",
          notes: "Publication release approved in Video Studio Delivery.",
        }),
      });
      const result = await response.json();
      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Publication approval failed");
      }
      setMessage("Publication release approved · authenticated approval recorded");
      await inspect({ quiet: true });
    } catch (approvalError) {
      setError(approvalError.message || "Publication approval failed");
    } finally {
      setWorking("");
    }
  }

  async function authorizeTarget(target) {
    const readinessId = publishing?.release?.readiness?.id;
    if (!readinessId || !target?.id || working) return;
    setWorking(`authorize:${target.id}`);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/creative/release/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organization_id: runtime.organizationId,
          release_readiness_report_id: readinessId,
          publish_target_id: target.id,
        }),
      });
      const result = await response.json();
      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Target authorization failed");
      }
      setMessage(`${target.name || target.channel || target.id} authorized · no external publication executed yet`);
      await inspect({ quiet: true });
    } catch (authorizationError) {
      setError(authorizationError.message || "Target authorization failed");
    } finally {
      setWorking("");
    }
  }

  async function executeTarget(target) {
    const commandId = target?.command?.id;
    if (!commandId || working) return;
    setWorking(`execute:${target.id}`);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/creative/release/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organization_id: runtime.organizationId,
          publish_command_asset_node_id: commandId,
        }),
      });
      const result = await response.json();
      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Publication execution failed");
      }
      const state = result.execution?.metadata?.execution_status || "UPDATED";
      setMessage(`${target.name || target.channel || target.id} · ${label(state)}`);
      await inspect({ quiet: true });
      await runtime.refresh?.();
    } catch (executionError) {
      setError(executionError.message || "Publication execution failed");
    } finally {
      setWorking("");
    }
  }

  async function verifyTarget(target) {
    const commandId = target?.command?.id;
    if (!commandId || working) return;
    setWorking(`verify:${target.id}`);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/creative/release/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organization_id: runtime.organizationId,
          publish_command_asset_node_id: commandId,
          action: "verify",
        }),
      });
      const result = await response.json();
      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Remote publication verification failed");
      }
      if (result.result?.published) {
        setMessage(`${target.name || target.channel || target.id} · verified published by remote read-back`);
      } else {
        setMessage(`${target.name || target.channel || target.id} · remote object not final yet; no duplicate publish was sent`);
      }
      await inspect({ quiet: true });
      await runtime.refresh?.();
    } catch (verificationError) {
      setError(verificationError.message || "Remote publication verification failed");
    } finally {
      setWorking("");
    }
  }

  const targets = publishing?.targets || [];
  const summary = publishing?.summary || {};
  const readiness = publishing?.release?.readiness || null;
  const publicationApproved = Boolean(publishing?.release?.publish_approval);
  const master = publishing?.master || null;
  const delivery = publishing?.channel_delivery || null;

  const readyTargets = useMemo(
    () => targets.filter((target) => target.configuration_valid),
    [targets],
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-[#F6F3EE] text-[#726B63]">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        <span className="text-[9px]">Inspecting release evidence…</span>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-[#F6F3EE] text-[#2A2723]">
      <div className="sticky top-0 z-20 border-b border-black/[0.07] bg-[#F6F3EE]/95 px-4 py-3 backdrop-blur-sm lg:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[7px] font-semibold uppercase tracking-[0.14em] text-[#8A633C]">Release desk</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              <h2 className="truncate text-[15px] font-semibold tracking-[-0.02em]">{publishing?.project?.name || project?.name || "Delivery"}</h2>
              <span className="text-[8px] text-[#817B73]">{master ? `${master.technical?.width || "—"}×${master.technical?.height || "—"} · ${duration(master.technical?.duration_seconds)}` : "No release master"}</span>
              <span className={`rounded-full border px-2 py-1 text-[7px] font-semibold ${statusTone(readiness?.passed ? "READY" : "REVIEW")}`}>{readiness?.passed ? "RELEASE READY" : "BLOCKED"}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => editor?.setActiveWorkspace?.("render")} className="h-8 rounded-lg border border-black/[0.08] bg-white px-3 text-[8px] font-semibold text-[#716B63]">Mastering</button>
            <button type="button" onClick={() => inspect()} disabled={Boolean(working)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-3 text-[8px] font-semibold text-[#716B63] disabled:opacity-40"><RefreshCw size={8} /> Refresh</button>
          </div>
        </div>
        {message ? <div className="mt-2 rounded-lg border border-emerald-700/10 bg-emerald-50 px-3 py-2 text-[8px] text-emerald-800">{message}</div> : null}
        {error ? <div className="mt-2 rounded-lg border border-red-700/10 bg-red-50 px-3 py-2 text-[8px] text-red-800">{error}</div> : null}
      </div>

      <div className="grid min-h-[760px] xl:grid-cols-[minmax(0,1fr)_330px]">
        <main className="min-w-0 border-r border-black/[0.07] p-4 lg:p-5">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Targets", summary.target_count ?? 0, Waypoints],
              ["Verified published", summary.published_count ?? 0, CheckCircle2],
              ["Awaiting verification", (summary.verification_required_count ?? 0) + (summary.pending_count ?? 0), RadioTower],
              ["Exceptions", summary.failed_count ?? 0, AlertTriangle],
            ].map(([name, value, Icon]) => (
              <div key={name} className="rounded-xl border border-black/[0.07] bg-white px-3 py-3">
                <div className="flex items-center gap-1.5 text-[7px] font-semibold uppercase tracking-[0.1em] text-[#918B83]"><Icon size={9} /> {name}</div>
                <div className="mt-1 text-[14px] font-semibold tabular-nums text-[#403C37]">{value}</div>
              </div>
            ))}
          </div>

          <section className="mt-3 overflow-hidden rounded-xl border border-black/[0.08] bg-[#211F1C] shadow-sm">
            <div className="flex min-h-[360px] items-center justify-center">
              {master?.preview_url ? (
                <video src={master.preview_url} controls preload="metadata" className="max-h-[620px] w-full object-contain" />
              ) : (
                <div className="max-w-md px-8 text-center text-white">
                  <Film className="mx-auto h-7 w-7 text-white/30" />
                  <div className="mt-3 text-[10px] font-semibold text-white/70">Release master preview unavailable</div>
                  <div className="mt-1 text-[8px] leading-4 text-white/40">{master?.preview_error || "Return to Mastering and create an approved final render."}</div>
                </div>
              )}
            </div>
            <div className="border-t border-white/10 bg-black/20 px-4 py-3 text-white">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><div className="text-[7px] font-semibold uppercase tracking-[0.1em] text-white/35">Approved release master</div><div className="mt-0.5 text-[10px] font-semibold text-white/80">{master?.name || "Final render"}</div></div>
                <div className="text-right text-[8px] text-white/45">{master?.export_profile?.name || master?.export_profile?.id || "No export profile"}</div>
              </div>
            </div>
          </section>

          <section className="mt-3 overflow-hidden rounded-xl border border-black/[0.07] bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/[0.06] px-4 py-3">
              <div><div className="text-[7px] font-semibold uppercase tracking-[0.11em] text-[#8A633C]">Channel deliveries</div><div className="mt-0.5 text-[9px] text-[#716B63]">Authorize → dispatch → remote acknowledgement → exact read-back → verified published</div></div>
              <span className="text-[8px] text-[#918B83]">{readyTargets.length}/{targets.length} configured</span>
            </div>

            <div className="divide-y divide-black/[0.06]">
              {targets.map((target) => {
                const busyAuthorize = working === `authorize:${target.id}`;
                const busyExecute = working === `execute:${target.id}`;
                const busyVerify = working === `verify:${target.id}`;
                const publicationUrl = target.external_publication_url;
                return (
                  <div key={target.id} className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_210px]">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-[10px] font-semibold text-[#403C37]">{target.name || target.channel || target.id}</div>
                        <span className={`rounded-full border px-1.5 py-0.5 text-[6px] font-semibold ${statusTone(target.state)}`}>{label(target.state)}</span>
                        {!target.configuration_valid ? <span className="rounded-full border border-red-700/10 bg-red-50 px-1.5 py-0.5 text-[6px] font-semibold text-red-800">CONFIG BLOCKED</span> : null}
                      </div>
                      <div className="mt-1 text-[7px] text-[#918B83]">{target.channel || "channel —"} · {target.provider_id || target.provider || target.connector || "provider —"} · {target.service_id || "service —"}</div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-3">
                        <Evidence passed={Boolean(target.command)}>Authorization {target.command ? "recorded" : "not created"}</Evidence>
                        <Evidence passed={target.remote_acknowledged}>Remote acknowledgement {target.remote_acknowledged ? "recorded with exact ID" : target.execution ? "not received yet" : "not executed"}</Evidence>
                        <Evidence passed={target.published}>Verified publication {target.published ? "proven by read-back" : target.remote_acknowledged ? "read-back required" : "not yet eligible"}</Evidence>
                      </div>
                      {target.error ? <div className="mt-3 rounded-lg border border-red-700/10 bg-red-50 px-3 py-2 text-[7px] leading-4 text-red-900">{target.error}</div> : null}
                      {target.execution ? <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[7px] text-[#918B83]"><span>provider {target.execution.provider_status || target.execution.provider_id || "—"}</span><span>settlement {label(target.execution.settlement || "—")}</span><span>remote id {target.external_publication_id || "—"}</span></div> : null}
                      {target.publication_evidence ? <div className="mt-2 text-[7px] text-[#918B83]">read-back {label(target.publication_evidence.remote_state)} · evidence <span className="font-mono">{target.publication_evidence.id}</span></div> : null}
                      {publicationUrl && target.published ? <a href={publicationUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-[8px] font-semibold text-[#76583A] hover:underline">Open verified publication <ExternalLink size={8} /></a> : null}
                    </div>
                    <div className="flex flex-col justify-center gap-2">
                      {!target.command ? (
                        <button type="button" onClick={() => authorizeTarget(target)} disabled={!target.can_authorize || Boolean(working)} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#A37849]/15 bg-[#F5EEE5] px-3 text-[8px] font-semibold text-[#76583A] disabled:cursor-not-allowed disabled:opacity-35">{busyAuthorize ? <Loader2 size={9} className="animate-spin" /> : <ShieldCheck size={9} />} Authorize target</button>
                      ) : target.can_execute ? (
                        <button type="button" onClick={() => executeTarget(target)} disabled={Boolean(working)} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#25231F] px-3 text-[8px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-35">{busyExecute ? <Loader2 size={9} className="animate-spin" /> : target.can_poll ? <RefreshCw size={9} /> : <Send size={9} />} {target.can_poll ? "Check provider" : "Publish"}</button>
                      ) : target.can_verify ? (
                        <button type="button" onClick={() => verifyTarget(target)} disabled={Boolean(working)} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#25231F] px-3 text-[8px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-35">{busyVerify ? <Loader2 size={9} className="animate-spin" /> : <RefreshCw size={9} />} Verify publication</button>
                      ) : (
                        <button type="button" disabled className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-emerald-700/10 bg-emerald-50 px-3 text-[8px] font-semibold text-emerald-800 disabled:opacity-100"><CheckCircle2 size={9} /> {target.published ? "Verified published" : label(target.state)}</button>
                      )}
                      <div className="text-center text-[6px] leading-3 text-[#A09A92]">{!target.command ? "Creates an immutable publish command only." : target.can_execute ? "Uses the existing idempotent command; retries do not create a new authorization." : target.can_verify ? "Read-only provider check. It never resends the publication." : target.published ? "Remote publication state is backed by immutable read-back evidence." : "No published claim without provider proof."}</div>
                    </div>
                  </div>
                );
              })}
              {!targets.length ? <div className="p-5 text-[8px] leading-4 text-[#918B83]">No governed publish targets are configured for this project. Avantiqo will not infer a destination or publish to a connected account by accident.</div> : null}
            </div>
          </section>
        </main>

        <aside className="bg-white">
          <div className="border-b border-black/[0.06] px-4 py-3">
            <div className="flex items-center gap-1.5 text-[7px] font-semibold uppercase tracking-[0.12em] text-[#8A633C]"><ShieldCheck size={9} /> Release control</div>
            <div className="mt-1 text-[11px] font-semibold text-[#403C37]">Publication authority</div>
            <div className="mt-1 text-[8px] leading-4 text-[#918B83]">Authorization permits dispatch. Only provider read-back proves publication.</div>
          </div>

          <div className={`border-b px-4 py-3 ${readiness?.passed && publicationApproved ? "border-emerald-700/10 bg-emerald-50/60" : "border-amber-700/10 bg-amber-50/60"}`}>
            <div className="flex items-start gap-2">
              {readiness?.passed && publicationApproved ? <CheckCircle2 size={13} className="mt-0.5 text-emerald-700" /> : <AlertTriangle size={13} className="mt-0.5 text-amber-700" />}
              <div>
                <div className={`text-[9px] font-semibold ${readiness?.passed && publicationApproved ? "text-emerald-900" : "text-amber-950"}`}>{readiness?.passed && publicationApproved ? "Publication release approved" : readiness?.passed ? "Publication approval required" : "Release readiness blocked"}</div>
                <div className={`mt-1 text-[8px] leading-4 ${readiness?.passed && publicationApproved ? "text-emerald-800/70" : "text-amber-900/70"}`}>{readiness?.passed && publicationApproved ? "Targets may be authorized individually. Nothing is called published until exact remote read-back succeeds." : "Avantiqo will not create connector commands until the current immutable readiness report is approved for publishing."}</div>
              </div>
            </div>
          </div>

          <div className="p-4">
            <div className="space-y-2">
              <Evidence passed={Boolean(master)}>Final master {master ? "present" : "missing"}</Evidence>
              <Evidence passed={readiness?.passed === true}>Release readiness {readiness?.passed ? "passed" : "not passed"}</Evidence>
              <Evidence passed={publicationApproved}>Authenticated PUBLISH_RELEASE approval {publicationApproved ? "recorded" : "not recorded"}</Evidence>
              <Evidence passed={!delivery || delivery.passed}>Channel derivative proof {delivery ? (delivery.passed ? "passed" : "has failures") : "not present"}</Evidence>
              <Evidence passed={targets.length > 0}>{targets.length} governed publish target{targets.length === 1 ? "" : "s"}</Evidence>
            </div>

            {(readiness?.failed_checks || []).length ? <div className="mt-4 rounded-xl border border-red-700/12 bg-red-50 p-3"><div className="text-[8px] font-semibold text-red-950">Release blockers</div><div className="mt-2 space-y-1 text-[7px] leading-4 text-red-900/70">{readiness.failed_checks.map((check) => <div key={check}>• {label(check)}</div>)}</div></div> : null}

            <div className="mt-4 grid gap-2">
              <button type="button" onClick={approvePublication} disabled={!publishing?.release?.can_approve_publication || Boolean(working)} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#25231F] px-3 text-[8px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-35">{working === "approve-release" ? <Loader2 size={9} className="animate-spin" /> : <ShieldCheck size={9} />} {publicationApproved ? "Publication approved" : "Approve publication release"}</button>
              <button type="button" onClick={() => editor?.setActiveWorkspace?.("render")} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-3 text-[8px] font-semibold text-[#5F5952]">Review master <ChevronRight size={9} /></button>
            </div>

            <div className="mt-4 border-t border-black/[0.06] pt-3">
              <div className="text-[7px] font-semibold uppercase tracking-[0.1em] text-[#918B83]">Release audit</div>
              <div className="mt-2 space-y-1.5 text-[7px] text-[#817B73]">
                <div className="flex justify-between gap-3"><span>Readiness</span><span className="max-w-[155px] truncate font-mono text-[#49443F]">{readiness?.id || "—"}</span></div>
                <div className="flex justify-between gap-3"><span>Master</span><span className="max-w-[155px] truncate font-mono text-[#49443F]">{master?.id || "—"}</span></div>
                <div className="flex justify-between gap-3"><span>Checksum</span><span className="max-w-[155px] truncate font-mono text-[#49443F]">{master?.technical?.checksum || "—"}</span></div>
                <div className="flex justify-between gap-3"><span>Approval</span><span className="max-w-[155px] truncate font-mono text-[#49443F]">{publishing?.release?.publish_approval?.id || "—"}</span></div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
