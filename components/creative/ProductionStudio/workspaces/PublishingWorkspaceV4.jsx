"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Fingerprint,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";

import PublishingWorkspaceV3 from "./PublishingWorkspaceV3";

function label(value) {
  return String(value || "—").replaceAll("_", " ");
}

function tone(status) {
  if (["MATCHED_BYTES", "MATCHED_FULL"].includes(status)) {
    return "border-emerald-700/15 bg-emerald-50 text-emerald-900";
  }
  if (status === "MISMATCHED") {
    return "border-red-700/15 bg-red-50 text-red-900";
  }
  if (["MATCHED_PARTIAL", "REMOTE_MEDIA_REFERENCE_ONLY"].includes(status)) {
    return "border-amber-700/15 bg-amber-50 text-amber-900";
  }
  return "border-black/[0.08] bg-[#F8F6F2] text-[#716B63]";
}

function MediaIcon({ status }) {
  if (["MATCHED_BYTES", "MATCHED_FULL"].includes(status)) {
    return <CheckCircle2 size={11} />;
  }
  if (status === "MISMATCHED") return <ShieldAlert size={11} />;
  return <AlertTriangle size={11} />;
}

export default function PublishingWorkspaceV4({ runtime, editor }) {
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
        throw new Error(result.error || "Remote media identity inspection failed");
      }
      setPublishing(result.publishing || null);
    } catch (inspectError) {
      setError(inspectError.message || "Remote media identity inspection failed");
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
      const response = await fetch("/api/creative/release/media-identity", {
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
        throw new Error(result.error || "Remote media identity recheck failed");
      }
      await inspect();
      await runtime.refresh?.();
    } catch (recheckError) {
      setError(recheckError.message || "Remote media identity recheck failed");
    } finally {
      setWorking("");
    }
  }

  const targets = (publishing?.targets || []).filter((target) => target.was_published);
  const summary = publishing?.summary || {};

  return (
    <div className="h-full overflow-auto bg-[#F6F3EE]">
      {targets.length ? (
        <section className="border-b border-black/[0.07] bg-white px-4 py-3 lg:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-1.5 text-[7px] font-semibold uppercase tracking-[0.12em] text-[#8A633C]">
                <Fingerprint size={9} /> Remote media identity
              </div>
              <div className="mt-1 max-w-3xl text-[9px] leading-4 text-[#716B63]">
                Avantiqo compares provider-accessible video against the exact approved derivative. Byte equality is strongest proof; MPEG-7 visual signatures are used only to recognize the same video after provider transcoding. Partial matches remain partial, and audio identity is not yet certified in V1.
              </div>
            </div>
            <button
              type="button"
              onClick={inspect}
              disabled={Boolean(working)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-3 text-[8px] font-semibold text-[#716B63] disabled:opacity-40"
            >
              <RefreshCw size={8} /> Refresh media truth
            </button>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-5">
            {[
              ["Matched", summary.remote_media_matched_count ?? 0],
              ["Partial", summary.remote_media_partial_count ?? 0],
              ["Mismatch", summary.remote_media_mismatch_count ?? 0],
              ["Reference only", summary.remote_media_reference_only_count ?? 0],
              ["Unverifiable", summary.remote_media_unverifiable_count ?? 0],
            ].map(([name, value]) => (
              <div key={name} className="rounded-xl border border-black/[0.07] bg-[#FBFAF7] px-3 py-2.5">
                <div className="text-[7px] uppercase tracking-[0.1em] text-[#918B83]">{name}</div>
                <div className="mt-1 text-[14px] font-semibold text-[#403C37]">{value}</div>
              </div>
            ))}
          </div>

          <div className="mt-3 grid gap-2 lg:grid-cols-2">
            {targets.map((target) => {
              const evidence = target.publication_remote_media_identity || null;
              const status = target.remote_media_identity_status || "NOT_CHECKED";
              const busy = working === target.command?.id;
              return (
                <div key={target.id} className={`rounded-xl border px-3 py-3 ${tone(status)}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-[8px] font-semibold uppercase tracking-[0.08em]">
                        <MediaIcon status={status} /> {label(status)}
                      </div>
                      <div className="mt-1 truncate text-[10px] font-semibold">
                        {target.name || target.channel || target.id}
                      </div>
                      <div className="mt-2 grid gap-1 text-[7px] leading-4 opacity-75 sm:grid-cols-2">
                        <span>Byte identity: {target.remote_media_byte_identity_verified ? "verified" : "no"}</span>
                        <span>Perceptual identity: {target.remote_media_perceptual_identity_verified ? "verified" : target.remote_media_perceptual_match_detected ? "partial" : "no"}</span>
                        <span>Method: {label(evidence?.visual_signature_method || "not analyzed")}</span>
                        <span>Audio: {label(evidence?.audio_identity_status || "not evaluated")}</span>
                        <span>Source: {evidence?.source_dimensions || "—"}</span>
                        <span>Remote: {evidence?.remote_dimensions || "—"}</span>
                      </div>
                      {status === "MISMATCHED" ? (
                        <div className="mt-2 rounded-lg border border-red-700/10 bg-white/70 px-2.5 py-2 text-[7px] leading-4">
                          Media mismatch: the provider-accessible publication does not match the immutable approved derivative under the current visual-signature evidence.
                        </div>
                      ) : null}
                      {evidence?.analysis_capped ? (
                        <div className="mt-2 text-[7px] leading-4 opacity-65">
                          Analysis was capped at {evidence.analysis_seconds || "configured"} seconds, so this result cannot be promoted to full perceptual identity.
                        </div>
                      ) : null}
                      {evidence?.limitation ? (
                        <div className="mt-2 text-[7px] leading-4 opacity-65">
                          Limit: {label(evidence.limitation)}
                        </div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => recheck(target)}
                      disabled={!target.can_recheck_remote_media_identity || Boolean(working)}
                      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-current/15 bg-white/75 px-3 text-[7px] font-semibold disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      {busy ? <Loader2 size={8} className="animate-spin" /> : <RefreshCw size={8} />}
                      Recheck media
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

      <PublishingWorkspaceV3 runtime={runtime} editor={editor} />
    </div>
  );
}
