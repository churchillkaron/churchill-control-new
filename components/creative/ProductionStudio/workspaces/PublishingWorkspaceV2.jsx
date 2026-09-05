"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import PublishingWorkspace from "./PublishingWorkspace";

function label(value) {
  return String(value || "—").replaceAll("_", " ");
}

function tone(target) {
  if (target?.current_live === true) {
    return "border-emerald-700/15 bg-emerald-50 text-emerald-900";
  }
  if (target?.current_live === false) {
    return "border-red-700/15 bg-red-50 text-red-900";
  }
  return "border-amber-700/15 bg-amber-50 text-amber-900";
}

function Icon({ target }) {
  if (target?.current_live === true) return <CheckCircle2 size={11} />;
  if (target?.current_live === false) return <AlertTriangle size={11} />;
  return <Clock3 size={11} />;
}

export default function PublishingWorkspaceV2({ runtime, editor }) {
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
        throw new Error(result.error || "Publication lifecycle inspection failed");
      }
      setPublishing(result.publishing || null);
    } catch (inspectError) {
      setError(inspectError.message || "Publication lifecycle inspection failed");
    }
  }, [runtime.organizationId, project?.id]);

  useEffect(() => {
    inspect();
  }, [inspect]);

  async function revalidate(target) {
    const commandId = target?.command?.id;
    if (!commandId || working) return;
    setWorking(commandId);
    setError("");
    try {
      const response = await fetch("/api/creative/release/lifecycle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organization_id: runtime.organizationId,
          publish_command_asset_node_id: commandId,
          action: "revalidate",
        }),
      });
      const result = await response.json();
      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Publication lifecycle revalidation failed");
      }
      await inspect();
      await runtime.refresh?.();
    } catch (revalidationError) {
      setError(revalidationError.message || "Publication lifecycle revalidation failed");
    } finally {
      setWorking("");
    }
  }

  const historicalTargets = (publishing?.targets || []).filter(
    (target) => target.was_published,
  );
  const summary = publishing?.summary || {};

  return (
    <div className="h-full overflow-auto bg-[#F6F3EE]">
      {historicalTargets.length ? (
        <section className="border-b border-black/[0.07] bg-white px-4 py-3 lg:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-1.5 text-[7px] font-semibold uppercase tracking-[0.12em] text-[#8A633C]">
                <ShieldCheck size={9} /> Post-publication truth
              </div>
              <div className="mt-1 text-[9px] text-[#716B63]">
                Historical publication proof is immutable. Current remote availability is revalidated separately.
              </div>
            </div>
            <button
              type="button"
              onClick={inspect}
              disabled={Boolean(working)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-3 text-[8px] font-semibold text-[#716B63] disabled:opacity-40"
            >
              <RefreshCw size={8} /> Refresh state
            </button>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-black/[0.07] bg-[#F8F6F2] px-3 py-2.5">
              <div className="text-[7px] uppercase tracking-[0.1em] text-[#918B83]">Live now</div>
              <div className="mt-1 text-[14px] font-semibold text-[#403C37]">{summary.live_now_count ?? 0}</div>
            </div>
            <div className="rounded-xl border border-black/[0.07] bg-[#F8F6F2] px-3 py-2.5">
              <div className="text-[7px] uppercase tracking-[0.1em] text-[#918B83]">No longer live</div>
              <div className="mt-1 text-[14px] font-semibold text-[#403C37]">{summary.no_longer_live_count ?? 0}</div>
            </div>
            <div className="rounded-xl border border-black/[0.07] bg-[#F8F6F2] px-3 py-2.5">
              <div className="text-[7px] uppercase tracking-[0.1em] text-[#918B83]">Unverifiable</div>
              <div className="mt-1 text-[14px] font-semibold text-[#403C37]">{summary.unverifiable_count ?? 0}</div>
            </div>
          </div>

          <div className="mt-3 grid gap-2 lg:grid-cols-2">
            {historicalTargets.map((target) => {
              const lifecycle = target.publication_lifecycle || null;
              const busy = working === target.command?.id;
              return (
                <div key={target.id} className={`rounded-xl border px-3 py-3 ${tone(target)}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-[8px] font-semibold uppercase tracking-[0.08em]">
                        <Icon target={target} /> {label(target.current_truth)}
                      </div>
                      <div className="mt-1 truncate text-[10px] font-semibold">
                        {target.name || target.channel || target.id}
                      </div>
                      <div className="mt-1 text-[7px] leading-4 opacity-70">
                        Was published · remote state {label(lifecycle?.remote_state || "not rechecked")}
                        {lifecycle?.observed_at ? ` · checked ${new Date(lifecycle.observed_at).toLocaleString()}` : ""}
                      </div>
                      {lifecycle?.reason ? (
                        <div className="mt-1 text-[7px] leading-4 opacity-70">{lifecycle.reason}</div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => revalidate(target)}
                      disabled={!target.can_revalidate_lifecycle || Boolean(working)}
                      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-current/15 bg-white/70 px-3 text-[7px] font-semibold disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      {busy ? <Loader2 size={8} className="animate-spin" /> : <RefreshCw size={8} />}
                      Recheck remote
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

      <PublishingWorkspace runtime={runtime} editor={editor} />
    </div>
  );
}
