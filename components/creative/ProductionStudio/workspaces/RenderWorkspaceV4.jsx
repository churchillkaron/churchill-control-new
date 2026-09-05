"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  GitCompareArrows,
  History,
  Loader2,
  ShieldAlert,
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

function VersionState({ version }) {
  if (version?.publish_approval) return <span className="text-emerald-800">release approved</span>;
  if (version?.release_package?.certified) return <span className="text-[#8A633C]">package certified</span>;
  if (version?.final_render_approval) return <span className="text-[#716B63]">master approved</span>;
  return <span className="text-[#918B83]">not approved</span>;
}

export default function RenderWorkspaceV4({ runtime, editor }) {
  const project = runtime.projectRuntime?.current || null;
  const [history, setHistory] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [leftId, setLeftId] = useState("");
  const [rightId, setRightId] = useState("");

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
  const staleApprovalExists = useMemo(
    () => versions.some((version) => !version.current && version.publish_approval),
    [versions],
  );

  const selectComparison = useCallback(async (nextLeft, nextRight) => {
    if (!nextLeft || !nextRight || nextLeft === nextRight) return;
    await inspect({ left: nextLeft, right: nextRight });
  }, [inspect]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#F6F3EE]">
      <div className="shrink-0 border-b border-black/[0.07] bg-[#DED7CC] px-4 py-2.5 lg:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <History size={11} className="text-[#8A633C]" />
              <div>
                <div className="text-[7px] font-semibold uppercase tracking-[0.12em] text-[#8A633C]">Master versions</div>
                <div className="text-[8px] text-[#716B63]">Immutable release history · approvals never cross versions</div>
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
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_280px]">
              {[compare.left, compare.right].map((version, index) => (
                <div key={version.master_asset_node_id} className="overflow-hidden rounded-xl border border-black/[0.07] bg-white">
                  <div className="flex items-center justify-between border-b border-black/[0.06] px-3 py-2">
                    <div className="text-[8px] font-semibold text-[#403C37]">{index === 0 ? "Previous" : "Current"} · {version.label}</div>
                    <div className="text-[7px] text-[#918B83]">{formatDate(version.created_at)}</div>
                  </div>
                  <div className="flex aspect-video items-center justify-center bg-[#211F1C]">
                    {version.preview_url ? <video src={version.preview_url} controls preload="metadata" className="h-full w-full object-contain" /> : <div className="px-6 text-center text-[8px] text-white/40">{version.preview_error || "Preview unavailable"}</div>}
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
                <div className="flex items-center gap-1.5 text-[7px] font-semibold uppercase tracking-[0.1em] text-[#8A633C]"><GitCompareArrows size={9} /> Exact changes</div>
                <div className="mt-2 text-[8px] font-semibold text-[#403C37]">{changedFields.length ? `${changedFields.length} governed differences` : "No governed technical differences"}</div>
                <div className="mt-3 space-y-2">
                  {Object.entries(compare.diff?.changes || {}).map(([field, change]) => (
                    <div key={field} className="rounded-lg border border-black/[0.06] bg-[#F8F6F2] px-2.5 py-2">
                      <div className="text-[6px] font-semibold uppercase tracking-[0.08em] text-[#918B83]">{field.replaceAll("_", " ")}</div>
                      <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-1 text-[7px] text-[#5E5851]">
                        <span className="truncate">{formatValue(change.from)}</span>
                        <span className="text-[#B2AAA0]">→</span>
                        <span className="truncate text-right font-semibold">{formatValue(change.to)}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 border-t border-black/[0.06] pt-2 text-[7px] leading-4 text-[#7E776F]">
                  Release package and publication approvals are version-scoped. Historical certifications remain auditable but never authorize a newer checksum.
                </div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-black/[0.06] pt-3">
              <span className="text-[7px] font-semibold uppercase tracking-[0.08em] text-[#918B83]">Compare</span>
              <select value={leftId} onChange={(event) => selectComparison(event.target.value, rightId)} className="h-7 rounded-lg border border-black/[0.08] bg-white px-2 text-[7px] text-[#5E5851] outline-none">
                {versions.map((version) => <option key={version.master_asset_node_id} value={version.master_asset_node_id}>{version.label}</option>)}
              </select>
              <span className="text-[7px] text-[#AAA198]">vs</span>
              <select value={rightId} onChange={(event) => selectComparison(leftId, event.target.value)} className="h-7 rounded-lg border border-black/[0.08] bg-white px-2 text-[7px] text-[#5E5851] outline-none">
                {versions.map((version) => <option key={version.master_asset_node_id} value={version.master_asset_node_id}>{version.label}</option>)}
              </select>
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
