"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileCheck2,
  Loader2,
} from "lucide-react";
import RenderWorkspaceV2 from "./RenderWorkspaceV2";

function StateIcon({ passed }) {
  return passed
    ? <CheckCircle2 size={11} className="text-emerald-700" />
    : <AlertTriangle size={11} className="text-amber-700" />;
}

function compactActual(report = {}) {
  const actual = report?.actual || {};
  const video = actual.video || {};
  const audio = Array.isArray(actual.audio) ? actual.audio[0] || {} : {};
  return [
    actual.format_names?.[0] || null,
    video.codec_name || null,
    video.width && video.height ? `${video.width}×${video.height}` : null,
    video.frame_rate ? `${Number(video.frame_rate).toFixed(3).replace(/\.000$/, "")} fps` : null,
    video.pixel_format || null,
    video.color_primaries || null,
    audio.codec_name || null,
    audio.channel_layout || (audio.channels ? `${audio.channels}ch` : null),
    actual.subtitles?.length ? `${actual.subtitles.length} subtitles` : null,
  ].filter(Boolean);
}

export default function RenderWorkspaceV3({ runtime, editor }) {
  const project = runtime.projectRuntime?.current || null;
  const [snapshot, setSnapshot] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  const inspect = useCallback(async () => {
    if (!project?.id || !runtime.organizationId) return;
    try {
      const response = await fetch("/api/creative/mastering/inspect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organization_id: runtime.organizationId,
          creative_project_id: project.id,
        }),
      });
      const result = await response.json();
      if (response.ok && result.success !== false) {
        setSnapshot(result.mastering || null);
      }
    } catch {
      // Primary workspace remains usable even when preflight enrichment is unavailable.
    }
  }, [project?.id, runtime.organizationId]);

  useEffect(() => {
    inspect();
  }, [inspect, runtime.orchestrationRuntime?.current?.inspected_at]);

  const runConformance = useCallback(async () => {
    if (!snapshot?.render?.id || running) return;
    setRunning(true);
    setError("");
    try {
      const response = await fetch("/api/creative/mastering/delivery-qc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "analyze",
          organization_id: runtime.organizationId,
          render_asset_node_id: snapshot.render.id,
          force: true,
        }),
      });
      const result = await response.json();
      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Delivery master conformance failed");
      }
      await inspect();
    } catch (runError) {
      setError(runError?.message || "Delivery master conformance failed");
    } finally {
      setRunning(false);
    }
  }, [inspect, running, runtime.organizationId, snapshot?.render?.id]);

  const delivery = snapshot?.delivery_master || null;
  const passed = !delivery?.required || delivery?.passed === true;
  const details = useMemo(() => compactActual(delivery?.report), [delivery?.report]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#F6F3EE]">
      {delivery?.required ? (
        <div className="shrink-0 border-b border-black/[0.07] bg-[#E7E1D7] px-4 py-2.5 lg:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <FileCheck2 size={11} className="text-[#8A633C]" />
                <div>
                  <div className="text-[7px] font-semibold uppercase tracking-[0.12em] text-[#8A633C]">Delivery master</div>
                  <div className="text-[8px] text-[#716B63]">Exact-file export-profile conformance</div>
                </div>
              </div>

              <button
                type="button"
                onClick={runConformance}
                disabled={!delivery?.can_analyze || running}
                className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[8px] font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${passed ? "border-emerald-700/10 bg-emerald-50 text-emerald-800" : "border-amber-700/10 bg-amber-50 text-amber-900"}`}
              >
                {running ? <Loader2 size={9} className="animate-spin" /> : <StateIcon passed={passed} />}
                {passed ? "Conformance passed" : delivery?.report ? "Re-run conformance" : "Run conformance"}
              </button>

              <div className="text-[7px] text-[#7E776F]">
                profile {delivery?.policy?.profile_id || "configured"}
              </div>
            </div>

            <div className="flex max-w-full flex-wrap justify-end gap-x-3 gap-y-1 text-[7px] tabular-nums text-[#716B63]">
              {details.length ? details.map((value) => <span key={value}>{value}</span>) : <span>No bound probe evidence yet</span>}
            </div>
          </div>

          {!delivery?.policy?.complete ? (
            <div className="mt-2 rounded-lg border border-amber-700/10 bg-amber-50 px-3 py-2 text-[7px] text-amber-900">
              Strict delivery profile incomplete · {(delivery?.policy?.missing_requirements || []).join(" · ")}
            </div>
          ) : null}
          {delivery?.report && !delivery?.report?.passed ? (
            <div className="mt-2 rounded-lg border border-red-700/10 bg-red-50 px-3 py-2 text-[7px] text-red-800">
              Delivery hold · {(delivery.report.failed_checks || []).join(" · ") || "master does not match profile"}
            </div>
          ) : null}
          {error ? (
            <div className="mt-2 rounded-lg border border-red-700/10 bg-red-50 px-3 py-2 text-[7px] text-red-800">{error}</div>
          ) : null}
        </div>
      ) : null}

      <div className="min-h-0 flex-1">
        <RenderWorkspaceV2 runtime={runtime} editor={editor} />
      </div>
    </div>
  );
}
