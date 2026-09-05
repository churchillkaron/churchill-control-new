"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Fingerprint,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";

import PublishingWorkspaceV2 from "./PublishingWorkspaceV2";

function label(value) {
  return String(value || "—").replaceAll("_", " ");
}

function integrityTone(status) {
  if (status === "MATCHED") return "border-emerald-700/15 bg-emerald-50 text-emerald-900";
  if (status === "DRIFTED") return "border-red-700/15 bg-red-50 text-red-900";
  if (status === "PARTIAL") return "border-amber-700/15 bg-amber-50 text-amber-900";
  return "border-black/[0.08] bg-[#F8F6F2] text-[#716B63]";
}

function IntegrityIcon({ status }) {
  if (status === "MATCHED") return <CheckCircle2 size={11} />;
  if (status === "DRIFTED") return <ShieldAlert size={11} />;
  if (status === "PARTIAL") return <Clock3 size={11} />;
  return <AlertTriangle size={11} />;
}

export default function PublishingWorkspaceV3({ runtime, editor }) {
  const project = runtime.projectRuntime?.current || null;
  const [publishing, setPublishing] = useState(null);
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");

  const inspect = useCallback(async () => {
    if (!runtime.organizationId || !project?.id) return;
    try {
      setError("");
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
        throw new Error(result.error || "Publication content integrity inspection failed");
      }
      setPublishing(result.publishing || null);
    } catch (inspectError) {
      setError(inspectError.message || "Publication content integrity inspection failed");
    }
  }, [runtime.organizationId, project?.id]);

  useEffect(() => {
    inspect();
  }, [inspect]);

  async function recheck(target) {
    const commandId = target?.command?.id;
    if (!commandId || working) return;
    setWorking(commandId);
    setError("");
    try {
      const response = await fetch("/api/creative/release/content-integrity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organization_id: runtime.organizationId,
          publish_command_asset_node_id: commandId,
          action: "recheck",
        }),
      });
      const result = await response.json();
      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Publication content integrity recheck failed");
      }
      await inspect();
      await runtime.refresh?.();
    } catch (recheckError) {
      setError(recheckError.message || "Publication content integrity recheck failed");
    } finally {
      setWorking("");
    }
  }

  const targets = (publishing?.targets || []).filter((target) => target.was_published);
  const summary = publishing?.summary || {};

  return (
    <div className="h-full overflow-auto bg-[#F6F3EE]">
      {targets.length ? (
        <section className="border-b border-black/[0.07] bg-[#FBFAF7] px-4 py-3 lg:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-1.5 text-[7px] font-semibold uppercase tracking-[0.12em] text-[#8A633C]">
                <Fingerprint size={9} /> Live content integrity
              </div>
              <div className="mt-1 max-w-3xl text-[9px] leading-4 text-[#716B63]">
                The approved caption/message is hash-bound to the publish command. Avantiqo also preserves the exact approved derivative checksum, but it never pretends a provider CDN URL proves remote byte equality when the provider does not expose a cryptographic checksum.
              </div>
            </div>
            <button
              type="button"
              onClick={inspect}
              disabled={Boolean(working)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-3 text-[8px] font-semibold text-[#716B63] disabled:opacity-40"
            >
              <RefreshCw size={8} /> Refresh integrity
            </button>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-4">
            {[
              ["Exact", summary.content_matched_count ?? 0],
              ["Drift", summary.content_drift_count ?? 0],
              ["Partial proof", summary.content_partial_count ?? 0],
              ["Unverifiable", summary.content_unverifiable_count ?? 0],
            ].map(([name, value]) => (
              <div key={name} className="rounded-xl border border-black/[0.07] bg-white px-3 py-2.5">
                <div className="text-[7px] uppercase tracking-[0.1em] text-[#918B83]">{name}</div>
                <div className="mt-1 text-[14px] font-semibold text-[#403C37]">{value}</div>
              </div>
            ))}
          </div>

          <div className="mt-3 grid gap-2 lg:grid-cols-2">
            {targets.map((target) => {
              const evidence = target.publication_content_integrity || null;
              const status = target.content_integrity_status || "NOT_RECHECKED";
              const busy = working === target.command?.id;
              return (
                <div key={target.id} className={`rounded-xl border px-3 py-3 ${integrityTone(status)}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-[8px] font-semibold uppercase tracking-[0.08em]">
                        <IntegrityIcon status={status} /> {label(status)}
                      </div>
                      <div className="mt-1 truncate text-[10px] font-semibold">
                        {target.name || target.channel || target.id}
                      </div>
                      <div className="mt-2 grid gap-1 text-[7px] leading-4 opacity-75 sm:grid-cols-2">
                        <span>Copy: {label(target.text_integrity_status || "not rechecked")}</span>
                        <span>Media: {label(target.media_integrity_status || "not rechecked")}</span>
                        <span>Approved derivative: {target.command?.publish_target_id || target.channel || "—"}</span>
                        <span>Remote byte checksum: {target.byte_identity_verified ? "verified" : "not exposed"}</span>
                      </div>
                      {target.content_drift_detected ? (
                        <div className="mt-2 rounded-lg border border-red-700/10 bg-white/70 px-2.5 py-2 text-[7px] leading-4">
                          Drift detected: the live publication no longer matches the immutable approved publication-content identity.
                        </div>
                      ) : null}
                      {(evidence?.limitations || []).length ? (
                        <div className="mt-2 text-[7px] leading-4 opacity-65">
                          Limit: {evidence.limitations.map(label).join(" · ")}
                        </div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => recheck(target)}
                      disabled={!target.can_recheck_content_integrity || Boolean(working)}
                      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-current/15 bg-white/75 px-3 text-[7px] font-semibold disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      {busy ? <Loader2 size={8} className="animate-spin" /> : <RefreshCw size={8} />}
                      Recheck content
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {error ? (
            <div className="mt-3 rounded-lg border border-red-700/10 bg-red-50 px-3 py-2 text-[8px] text-red-800">
              {error}
            </div>
          ) : null}
        </section>
      ) : null}

      <PublishingWorkspaceV2 runtime={runtime} editor={editor} />
    </div>
  );
}
