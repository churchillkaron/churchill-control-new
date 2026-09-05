"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  GitCompareArrows,
  History,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  ShieldAlert,
  StepBack,
  StepForward,
  Volume2,
} from "lucide-react";
import RenderWorkspaceV3 from "./RenderWorkspaceV3";

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatValue(value) {
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function formatTimecode(seconds, fps = 25) {
  const rate = Number.isFinite(Number(fps)) && Number(fps) > 0 ? Number(fps) : 25;
  const totalFrames = Math.max(0, Math.round(Number(seconds || 0) * rate));
  const frame = totalFrames % Math.round(rate);
  const totalSeconds = Math.floor(totalFrames / rate);
  const second = totalSeconds % 60;
  const minute = Math.floor(totalSeconds / 60) % 60;
  const hour = Math.floor(totalSeconds / 3600);
  return [hour, minute, second, frame]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

function percent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${(number * 100).toFixed(2)}%` : "—";
}

function VersionState({ version }) {
  if (version?.publish_approval) return <span className="text-emerald-800">release approved</span>;
  if (version?.release_package?.certified) return <span className="text-[#8A633C]">package certified</span>;
  if (version?.final_render_approval) return <span className="text-[#716B63]">master approved</span>;
  return <span className="text-[#918B83]">not approved</span>;
}

export default function RenderWorkspaceV4({ runtime, editor }) {
  const project = runtime.projectRuntime?.current || null;
  const leftVideoRef = useRef(null);
  const rightVideoRef = useRef(null);
  const [history, setHistory] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [leftId, setLeftId] = useState("");
  const [rightId, setRightId] = useState("");
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [monitorSide, setMonitorSide] = useState("right");
  const [evidence, setEvidence] = useState(null);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceError, setEvidenceError] = useState("");

  const inspect = useCallback(async ({ left = null, right = null } = {}) => {
    if (!project?.id || !runtime.organizationId) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/creative/mastering/versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organization_id: runtime.organizationId,
          creative_project_id: project.id,
          left_master_asset_node_id: left,
          right_master_asset_node_id: right,
        }),
      });
      const result = await response.json();
      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Master version history failed");
      }
      setHistory(result.history || null);
      setLeftId(result.history?.compare?.left?.master_asset_node_id || "");
      setRightId(result.history?.compare?.right?.master_asset_node_id || "");
      setPlayhead(0);
      setPlaying(false);
    } catch (inspectError) {
      setError(inspectError?.message || "Master version history failed");
    } finally {
      setLoading(false);
    }
  }, [project?.id, runtime.organizationId]);

  useEffect(() => {
    inspect();
  }, [inspect, runtime.orchestrationRuntime?.current?.inspected_at]);

  const versions = history?.versions || [];
  const current = versions.find((item) => item.current) || versions.at(-1) || null;
  const compare = history?.compare || null;
  const changedFields = compare?.diff?.changed_fields || [];
  const fps = Number(compare?.right?.technical?.frame_rate || compare?.left?.technical?.frame_rate || 25);
  const duration = Math.min(
    Number(compare?.left?.technical?.duration_seconds || Infinity),
    Number(compare?.right?.technical?.duration_seconds || Infinity),
  );
  const effectiveDuration = Number.isFinite(duration) ? duration : 0;
  const staleApprovalExists = useMemo(
    () => versions.some((version) => !version.current && version.publish_approval),
    [versions],
  );

  const loadEvidence = useCallback(async ({ analyze = false } = {}) => {
    if (!leftId || !rightId || leftId === rightId || !project?.id || !runtime.organizationId) {
      setEvidence(null);
      return;
    }
    setEvidenceLoading(true);
    setEvidenceError("");
    try {
      const response = await fetch("/api/creative/mastering/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: analyze ? "analyze" : "inspect",
          organization_id: runtime.organizationId,
          creative_project_id: project.id,
          left_master_asset_node_id: leftId,
          right_master_asset_node_id: rightId,
          force: analyze,
        }),
      });
      const result = await response.json();
      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Master comparison evidence failed");
      }
      setEvidence(result.comparison || null);
    } catch (compareError) {
      setEvidence(null);
      setEvidenceError(compareError?.message || "Master comparison evidence failed");
    } finally {
      setEvidenceLoading(false);
    }
  }, [leftId, project?.id, rightId, runtime.organizationId]);

  useEffect(() => {
    if (expanded && leftId && rightId && leftId !== rightId) loadEvidence();
  }, [expanded, leftId, loadEvidence, rightId]);

  useEffect(() => {
    if (leftVideoRef.current) leftVideoRef.current.muted = monitorSide !== "left";
    if (rightVideoRef.current) rightVideoRef.current.muted = monitorSide !== "right";
  }, [monitorSide, compare?.left?.preview_url, compare?.right?.preview_url]);

  const syncSeek = useCallback((seconds) => {
    const next = Math.max(0, Math.min(effectiveDuration || Number.MAX_SAFE_INTEGER, Number(seconds || 0)));
    if (leftVideoRef.current) leftVideoRef.current.currentTime = next;
    if (rightVideoRef.current) rightVideoRef.current.currentTime = next;
    setPlayhead(next);
  }, [effectiveDuration]);

  const togglePlayback = useCallback(async () => {
    const left = leftVideoRef.current;
    const right = rightVideoRef.current;
    if (!left || !right) return;
    if (playing) {
      left.pause();
      right.pause();
      setPlaying(false);
      return;
    }
    const anchor = Math.min(left.currentTime || 0, right.currentTime || 0);
    left.currentTime = anchor;
    right.currentTime = anchor;
    await Promise.allSettled([left.play(), right.play()]);
    setPlaying(true);
  }, [playing]);

  const stepFrame = useCallback((direction) => {
    const frameDuration = 1 / (Number.isFinite(fps) && fps > 0 ? fps : 25);
    leftVideoRef.current?.pause();
    rightVideoRef.current?.pause();
    setPlaying(false);
    syncSeek(playhead + direction * frameDuration);
  }, [fps, playhead, syncSeek]);

  const selectComparison = useCallback(async (nextLeft, nextRight) => {
    if (!nextLeft || !nextRight || nextLeft === nextRight) return;
    setEvidence(null);
    await inspect({ left: nextLeft, right: nextRight });
  }, [inspect]);

  const report = evidence?.report || null;
  const visual = report?.visual || null;
  const audio = report?.audio || null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#F6F3EE]">
      <div className="shrink-0 border-b border-black/[0.07] bg-[#DED7CC] px-4 py-2.5 lg:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <History size={11} className="text-[#8A633C]" />
              <div>
                <div className="text-[7px] font-semibold uppercase tracking-[0.12em] text-[#8A633C]">Master versions</div>
                <div className="text-[8px] text-[#716B63]">Immutable history · synchronized A/B review · checksum-bound evidence</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {versions.map((version) => (
                <button
                  key={version.master_asset_node_id}
                  type="button"
                  onClick={() => {
                    const previous = versions[Math.max(0, version.version - 2)];
                    const left = previous?.master_asset_node_id || versions[0]?.master_asset_node_id;
                    if (left && left !== version.master_asset_node_id) {
                      selectComparison(left, version.master_asset_node_id);
                      setExpanded(true);
                    }
                  }}
                  className={`rounded-lg border px-2.5 py-1.5 text-[7px] font-semibold ${version.current ? "border-[#8A633C]/30 bg-[#F8F2E8] text-[#6F4D2D]" : "border-black/[0.08] bg-white/70 text-[#716B63]"}`}
                >
                  {version.label}{version.current ? " · CURRENT" : ""}
                </button>
              ))}
              {!versions.length && !loading ? <span className="text-[7px] text-[#918B83]">No primary master versions yet</span> : null}
              {loading ? <Loader2 size={10} className="animate-spin text-[#8A633C]" /> : null}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {current ? (
              <div className="hidden text-right text-[7px] text-[#716B63] md:block">
                <div>{current.label} · {formatDate(current.created_at)}</div>
                <div><VersionState version={current} /></div>
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              disabled={versions.length < 2}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white/80 px-3 text-[8px] font-semibold text-[#665F57] disabled:opacity-35"
            >
              <GitCompareArrows size={9} /> Compare
              {expanded ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
            </button>
          </div>
        </div>

        {staleApprovalExists && current && !current.publish_approval ? (
          <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-700/10 bg-amber-50 px-3 py-2 text-[7px] leading-4 text-amber-900">
            <ShieldAlert size={10} className="mt-0.5 shrink-0" />
            An older master has release approval, but {current.label} is newer. The old approval remains in history and cannot authorize this master.
          </div>
        ) : null}
        {error ? <div className="mt-2 rounded-lg border border-red-700/10 bg-red-50 px-3 py-2 text-[7px] text-red-800">{error}</div> : null}

        {expanded && compare?.left && compare?.right ? (
          <div className="mt-3 rounded-xl border border-black/[0.08] bg-[#F6F3EE] p-3 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-black/[0.06] bg-[#25221F] px-3 py-2 text-white">
              <button type="button" onClick={() => stepFrame(-1)} className="rounded-md p-1.5 text-white/75 hover:bg-white/10"><StepBack size={11} /></button>
              <button type="button" onClick={togglePlayback} className="rounded-md bg-white/10 p-1.5 text-white hover:bg-white/15">{playing ? <Pause size={11} /> : <Play size={11} />}</button>
              <button type="button" onClick={() => stepFrame(1)} className="rounded-md p-1.5 text-white/75 hover:bg-white/10"><StepForward size={11} /></button>
              <div className="ml-1 font-mono text-[9px] tabular-nums text-white/85">{formatTimecode(playhead, fps)}</div>
              <div className="text-[7px] text-white/40">{formatValue(fps)} fps</div>
              <input
                type="range"
                min="0"
                max={effectiveDuration || 1}
                step={1 / (Number.isFinite(fps) && fps > 0 ? fps : 25)}
                value={Math.min(playhead, effectiveDuration || 1)}
                onChange={(event) => syncSeek(Number(event.target.value))}
                className="min-w-[160px] flex-1"
              />
              <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 p-0.5">
                <Volume2 size={9} className="ml-1 text-white/50" />
                {["left", "right"].map((side) => (
                  <button key={side} type="button" onClick={() => setMonitorSide(side)} className={`rounded-md px-2 py-1 text-[6px] font-semibold uppercase tracking-[0.08em] ${monitorSide === side ? "bg-white text-[#2A2724]" : "text-white/50"}`}>{side}</button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_280px]">
              {[compare.left, compare.right].map((version, index) => (
                <div key={version.master_asset_node_id} className="overflow-hidden rounded-xl border border-black/[0.07] bg-white">
                  <div className="flex items-center justify-between border-b border-black/[0.06] px-3 py-2">
                    <div className="text-[8px] font-semibold text-[#403C37]">{index === 0 ? "Previous" : "Current"} · {version.label}</div>
                    <div className="text-[7px] text-[#918B83]">{formatDate(version.created_at)}</div>
                  </div>
                  <div className="flex aspect-video items-center justify-center bg-[#211F1C]">
                    {version.preview_url ? (
                      <video
                        ref={index === 0 ? leftVideoRef : rightVideoRef}
                        src={version.preview_url}
                        preload="metadata"
                        playsInline
                        onTimeUpdate={index === 1 ? (event) => {
                          const time = event.currentTarget.currentTime || 0;
                          setPlayhead(time);
                          const peer = leftVideoRef.current;
                          if (peer && Math.abs((peer.currentTime || 0) - time) > Math.max(0.04, 1 / fps)) {
                            peer.currentTime = time;
                          }
                        } : undefined}
                        onPause={index === 1 ? () => setPlaying(false) : undefined}
                        onEnded={index === 1 ? () => setPlaying(false) : undefined}
                        className="h-full w-full object-contain"
                      />
                    ) : <div className="px-6 text-center text-[8px] text-white/40">{version.preview_error || "Preview unavailable"}</div>}
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 px-3 py-2 text-[7px] text-[#716B63]">
                    <span>{version.technical?.width || "—"}×{version.technical?.height || "—"}</span>
                    <span>{formatValue(version.technical?.frame_rate)} fps</span>
                    <span>{version.technical?.video_codec || "video —"}</span>
                    <span>{version.technical?.audio_codec || "audio —"}</span>
                    <span className="col-span-2"><VersionState version={version} /></span>
                  </div>
                </div>
              ))}

              <div className="rounded-xl border border-black/[0.07] bg-white px-3 py-3">
                <div className="flex items-center gap-1.5 text-[7px] font-semibold uppercase tracking-[0.1em] text-[#8A633C]"><GitCompareArrows size={9} /> Comparison evidence</div>
                <div className="mt-2 text-[8px] font-semibold text-[#403C37]">{changedFields.length ? `${changedFields.length} metadata differences` : "No governed metadata differences"}</div>

                <div className="mt-3 rounded-lg border border-black/[0.06] bg-[#F8F6F2] p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[6px] font-semibold uppercase tracking-[0.08em] text-[#918B83]">Decoded media evidence</div>
                      <div className="mt-0.5 text-[7px] text-[#5E5851]">Checksum-bound · FFmpeg deterministic analysis</div>
                    </div>
                    <button type="button" disabled={evidenceLoading || !evidence?.can_analyze} onClick={() => loadEvidence({ analyze: true })} className="inline-flex items-center gap-1 rounded-md border border-black/[0.08] bg-white px-2 py-1.5 text-[6.5px] font-semibold text-[#5E5851] disabled:opacity-35">
                      {evidenceLoading ? <Loader2 size={8} className="animate-spin" /> : <RefreshCw size={8} />}
                      {report ? "Re-analyze" : "Analyze"}
                    </button>
                  </div>

                  {report ? (
                    <div className="mt-2 grid grid-cols-2 gap-1.5 text-[7px] text-[#5E5851]">
                      <div><span className="text-[#918B83]">Visual changed</span><br /><strong>{percent(visual?.changed_frame_ratio)}</strong></div>
                      <div><span className="text-[#918B83]">Mean SSIM</span><br /><strong>{visual?.mean_ssim?.toFixed?.(5) || "—"}</strong></div>
                      <div><span className="text-[#918B83]">Changed frames</span><br /><strong>{visual?.changed_frame_count ?? "—"}</strong></div>
                      <div><span className="text-[#918B83]">Intervals</span><br /><strong>{visual?.changed_intervals_total ?? "—"}</strong></div>
                      <div><span className="text-[#918B83]">Audio residual RMS</span><br /><strong>{audio?.residual_is_silent_or_identical ? "silent" : audio?.residual_rms_dbfs !== null && audio?.residual_rms_dbfs !== undefined ? `${audio.residual_rms_dbfs} dBFS` : "—"}</strong></div>
                      <div><span className="text-[#918B83]">Audio peak</span><br /><strong>{audio?.residual_peak_dbfs !== null && audio?.residual_peak_dbfs !== undefined ? `${audio.residual_peak_dbfs} dBFS` : "—"}</strong></div>
                    </div>
                  ) : (
                    <div className="mt-2 text-[7px] leading-4 text-[#7E776F]">
                      {evidenceLoading ? "Reading current comparison evidence…" : evidence?.blocker || "Run analysis to create decoded-frame and program-audio evidence."}
                    </div>
                  )}
                  {evidenceError ? <div className="mt-2 text-[7px] text-red-700">{evidenceError}</div> : null}
                  {evidence?.support?.blockers?.length ? <div className="mt-2 text-[6.5px] leading-3 text-amber-800">{evidence.support.blockers.join(" · ")}</div> : null}
                </div>

                <div className="mt-3 max-h-40 space-y-2 overflow-auto">
                  {visual?.changed_intervals?.slice(0, 8).map((interval) => (
                    <button key={`${interval.start_frame}-${interval.end_frame}`} type="button" onClick={() => syncSeek(interval.start_seconds)} className="block w-full rounded-lg border border-black/[0.06] bg-white px-2.5 py-2 text-left">
                      <div className="text-[6px] font-semibold uppercase tracking-[0.08em] text-[#918B83]">Frames {interval.start_frame}–{interval.end_frame}</div>
                      <div className="mt-0.5 flex items-center justify-between text-[7px] text-[#5E5851]"><span>{formatTimecode(interval.start_seconds, fps)}</span><span>min SSIM {Number(interval.minimum_ssim).toFixed(5)}</span></div>
                    </button>
                  ))}
                  {!visual && Object.entries(compare.diff?.changes || {}).map(([field, change]) => (
                    <div key={field} className="rounded-lg border border-black/[0.06] bg-[#F8F6F2] px-2.5 py-2">
                      <div className="text-[6px] font-semibold uppercase tracking-[0.08em] text-[#918B83]">{field.replaceAll("_", " ")}</div>
                      <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-1 text-[7px] text-[#5E5851]"><span className="truncate">{formatValue(change.from)}</span><span className="text-[#B2AAA0]">→</span><span className="truncate text-right font-semibold">{formatValue(change.to)}</span></div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 border-t border-black/[0.06] pt-2 text-[7px] leading-4 text-[#7E776F]">Browser playback is synchronized review tooling. The persisted FFmpeg report is the governed evidence and never constitutes release approval.</div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-black/[0.06] pt-3">
              <span className="text-[7px] font-semibold uppercase tracking-[0.08em] text-[#918B83]">Compare</span>
              <select value={leftId} onChange={(event) => selectComparison(event.target.value, rightId)} className="h-7 rounded-lg border border-black/[0.08] bg-white px-2 text-[7px] text-[#5E5851] outline-none">{versions.map((version) => <option key={version.master_asset_node_id} value={version.master_asset_node_id}>{version.label}</option>)}</select>
              <span className="text-[7px] text-[#AAA198]">vs</span>
              <select value={rightId} onChange={(event) => selectComparison(leftId, event.target.value)} className="h-7 rounded-lg border border-black/[0.08] bg-white px-2 text-[7px] text-[#5E5851] outline-none">{versions.map((version) => <option key={version.master_asset_node_id} value={version.master_asset_node_id}>{version.label}</option>)}</select>
              {current?.publish_approval ? <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-emerald-700/10 bg-emerald-50 px-2 py-1 text-[7px] font-semibold text-emerald-800"><CheckCircle2 size={8} /> Current master release approved</span> : null}
            </div>
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1">
        <RenderWorkspaceV3 runtime={runtime} editor={editor} />
      </div>
    </div>
  );
}
