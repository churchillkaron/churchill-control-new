"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock3,
  GitCompareArrows,
  Loader2,
  MessageSquareText,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import ReviewCutPlayer from "./review/ReviewCutPlayer";

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function timecode(value = 0) {
  const total = Math.max(0, finite(value));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total - hours * 3600) / 60);
  const seconds = total - hours * 3600 - minutes * 60;
  const prefix = hours ? `${String(hours).padStart(2, "0")}:` : "";
  return `${prefix}${String(minutes).padStart(2, "0")}:${seconds.toFixed(2).padStart(5, "0")}`;
}

function timelineEntries(timeline = {}) {
  return Array.isArray(timeline?.metadata?.edit_decision_list)
    ? timeline.metadata.edit_decision_list
    : [];
}

function commentResolved(comment = {}) {
  return Boolean(comment.metadata?.resolved_at || comment.status === "APPROVED");
}

function versionLabel(version = {}, index, total) {
  return `V${Math.max(1, total - index)} · ${String(version.status || "CUT").replaceAll("_", " ")}`;
}

export default function ReviewWorkspaceV2({ runtime, editor }) {
  const project = runtime.projectRuntime?.current || null;
  const [review, setReview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [note, setNote] = useState("");
  const [playhead, setPlayhead] = useState(0);

  const request = useCallback(async (action, extra = {}) => {
    if (!project?.id || !runtime.organizationId) return null;
    const response = await fetch("/api/creative/review/edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        organization_id: runtime.organizationId,
        creative_project_id: project.id,
        ...extra,
      }),
    });
    const result = await response.json();
    if (!response.ok || result.success === false) {
      throw new Error(result.error || "Edit review request failed");
    }
    return result.result || null;
  }, [project?.id, runtime.organizationId]);

  const inspect = useCallback(async ({ quiet = false, prepare = false } = {}) => {
    if (!project?.id) return;
    if (!quiet) setLoading(true);
    setError("");
    try {
      const result = await request(prepare ? "prepare" : "inspect");
      const next = result?.review || result;
      setReview(next || null);
      if (!quiet) setPlayhead(0);
    } catch (inspectError) {
      setError(inspectError.message || "Edit review inspection failed");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [project?.id, request]);

  useEffect(() => {
    inspect({ prepare: true });
  }, [inspect]);

  async function addComment() {
    if (!note.trim() || !review?.timeline?.id || working) return;
    setWorking("comment");
    setError("");
    setMessage("");
    try {
      const result = await request("comment", {
        timeline_asset_node_id: review.timeline.id,
        body: note.trim(),
        timecode_seconds: playhead,
      });
      setReview(result?.review || review);
      setNote("");
      setMessage(`Review note added at ${timecode(playhead)}`);
      await runtime.orchestrationRuntime?.refresh?.({ quiet: true });
    } catch (commentError) {
      setError(commentError.message || "Could not add review note");
    } finally {
      setWorking("");
    }
  }

  async function resolveComment(comment) {
    if (!comment?.id || working) return;
    setWorking(`resolve:${comment.id}`);
    setError("");
    setMessage("");
    try {
      const result = await request("resolve", { comment_asset_node_id: comment.id });
      setReview(result?.review || review);
      setMessage("Review note resolved");
      await runtime.orchestrationRuntime?.refresh?.({ quiet: true });
    } catch (resolveError) {
      setError(resolveError.message || "Could not resolve review note");
    } finally {
      setWorking("");
    }
  }

  async function approveCut() {
    if (!review?.timeline?.id || !review?.can_approve || working) return;
    setWorking("approve");
    setError("");
    setMessage("");
    try {
      const result = await request("approve", {
        timeline_asset_node_id: review.timeline.id,
        notes: "Approved in Video Studio Review Room after timecoded review resolution.",
      });
      setReview(result?.review || review);
      setMessage("Edit approved · authenticated approval recorded");
      await runtime.orchestrationRuntime?.refresh?.({ quiet: true });
      await runtime.refresh?.();
    } catch (approvalError) {
      setError(approvalError.message || "Edit approval failed");
    } finally {
      setWorking("");
    }
  }

  const timeline = review?.timeline || null;
  const entries = timelineEntries(timeline);
  const openComments = useMemo(
    () => (review?.comments || []).filter((comment) => !commentResolved(comment)),
    [review?.comments],
  );
  const resolvedComments = useMemo(
    () => (review?.comments || []).filter(commentResolved),
    [review?.comments],
  );
  const comparison = review?.comparison || null;
  const totalDuration = finite(
    timeline?.metadata?.total_duration_seconds ?? timeline?.technical?.duration_seconds,
    entries.reduce((maximum, entry) => Math.max(maximum, finite(entry.timeline_out_seconds, 0)), 0),
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-[#F6F3EE] text-[#726B63]">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        <span className="text-[9px]">Preparing governed review cut…</span>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-[#F6F3EE] text-[#2A2723]">
      <div className="sticky top-0 z-20 border-b border-black/[0.07] bg-[#F6F3EE]/95 px-4 py-3 backdrop-blur-sm lg:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[7px] font-semibold uppercase tracking-[0.14em] text-[#8A633C]">Review room · director cut</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              <h2 className="text-[15px] font-semibold tracking-[-0.02em]">{review?.project?.name || project?.name || "Film review"}</h2>
              <span className="text-[8px] text-[#817B73]">{entries.length} decisions · {timecode(totalDuration)} · {review?.versions?.length || 0} versions</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => editor?.setActiveWorkspace?.("timeline")} className="h-8 rounded-lg border border-black/[0.08] bg-white px-3 text-[8px] font-semibold text-[#716B63]">Edit desk</button>
            <button type="button" onClick={() => inspect()} disabled={Boolean(working)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-3 text-[8px] font-semibold text-[#716B63] disabled:opacity-40"><RefreshCw size={8} /> Refresh</button>
            <button type="button" onClick={approveCut} disabled={!review?.can_approve || Boolean(working) || review?.approved} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#25231F] px-3 text-[8px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-35">{working === "approve" ? <Loader2 size={9} className="animate-spin" /> : <ShieldCheck size={9} />} {review?.approved ? "Cut approved" : "Approve cut"}</button>
            <button type="button" onClick={() => editor?.setActiveWorkspace?.("render")} disabled={!review?.ready_for_master} className="h-8 rounded-lg border border-black/[0.08] bg-white px-3 text-[8px] font-semibold text-[#716B63] disabled:cursor-not-allowed disabled:opacity-35">Mastering</button>
          </div>
        </div>
        {message ? <div className="mt-2 rounded-lg border border-emerald-700/10 bg-emerald-50 px-3 py-2 text-[8px] text-emerald-800">{message}</div> : null}
        {error ? <div className="mt-2 rounded-lg border border-red-700/10 bg-red-50 px-3 py-2 text-[8px] text-red-800">{error}</div> : null}
      </div>

      <div className="grid min-h-[800px] xl:grid-cols-[minmax(0,1fr)_360px]">
        <main className="min-w-0 border-r border-black/[0.07] p-4 lg:p-5">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Open notes", review?.open_comment_count || 0, MessageSquareText],
              ["Resolved", review?.resolved_comment_count || 0, CheckCircle2],
              ["Versions", review?.versions?.length || 0, GitCompareArrows],
              ["Cut state", review?.approved ? "APPROVED" : review?.can_approve ? "READY" : "REVIEW", ShieldCheck],
            ].map(([label, value, Icon]) => (
              <div key={label} className="rounded-xl border border-black/[0.07] bg-white px-3 py-3">
                <div className="flex items-center gap-1.5 text-[7px] font-semibold uppercase tracking-[0.1em] text-[#918B83]"><Icon size={9} /> {label}</div>
                <div className="mt-1 text-[14px] font-semibold tabular-nums text-[#403C37]">{value}</div>
              </div>
            ))}
          </div>

          <section className="mt-3 overflow-hidden rounded-xl border border-black/[0.08] bg-[#211F1C] shadow-sm">
            <ReviewCutPlayer
              timeline={timeline}
              value={playhead}
              onChange={setPlayhead}
              markers={review?.comments || []}
            />
          </section>

          {review?.versions?.length ? (
            <section className="mt-3 rounded-xl border border-black/[0.07] bg-white p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-1 text-[7px] font-semibold uppercase tracking-[0.1em] text-[#918B83]">Version stack</span>
                {review.versions.map((version, index) => (
                  <span key={version.id} className={`rounded-md border px-2.5 py-1.5 text-[7px] font-semibold ${index === 0 ? "border-[#A37849]/20 bg-[#F5EEE5] text-[#76583A]" : "border-black/[0.07] text-[#716B63]"}`}>
                    {versionLabel(version, index, review.versions.length)} · {timecode(version.duration_seconds)}
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          {comparison ? (
            <section className="mt-3 rounded-xl border border-black/[0.07] bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div><div className="flex items-center gap-1.5 text-[7px] font-semibold uppercase tracking-[0.11em] text-[#8A633C]"><GitCompareArrows size={9} /> Current vs previous cut</div><div className="mt-1 text-[8px] text-[#918B83]">Structural edit evidence, not visual guesswork</div></div>
                <div className="text-[7px] font-mono text-[#A09A92]">{String(comparison.current_timeline_asset_node_id || "").slice(0, 8)} ↔ {String(comparison.previous_timeline_asset_node_id || "").slice(0, 8)}</div>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-4">
                {[
                  ["Added", comparison.added_count],
                  ["Removed", comparison.removed_count],
                  ["Moved", comparison.moved_count],
                  ["Duration Δ", `${finite(comparison.duration_delta_seconds).toFixed(2)}s`],
                ].map(([label, value]) => <div key={label} className="rounded-lg bg-[#F8F6F2] px-3 py-2"><div className="text-[7px] text-[#918B83]">{label}</div><div className="mt-0.5 text-[10px] font-semibold text-[#49443F]">{value}</div></div>)}
              </div>
              {(comparison.added_keys?.length || comparison.removed_keys?.length || comparison.moved_keys?.length) ? (
                <div className="mt-3 grid gap-2 lg:grid-cols-3">
                  {[
                    ["Added decisions", comparison.added_keys || []],
                    ["Removed decisions", comparison.removed_keys || []],
                    ["Reordered decisions", comparison.moved_keys || []],
                  ].map(([title, keys]) => (
                    <div key={title} className="rounded-lg border border-black/[0.06] p-3"><div className="text-[7px] font-semibold text-[#716B63]">{title}</div><div className="mt-2 space-y-1 text-[6px] font-mono text-[#A09A92]">{keys.slice(0, 6).map((key) => <div key={key} className="truncate">{key}</div>)}{!keys.length ? <div>None</div> : null}</div></div>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}
        </main>

        <aside className="bg-white">
          <div className="border-b border-black/[0.06] p-4">
            <div className="flex items-center gap-1.5 text-[7px] font-semibold uppercase tracking-[0.12em] text-[#8A633C]"><MessageSquareText size={9} /> Timecoded review</div>
            <div className="mt-1 text-[11px] font-semibold text-[#403C37]">Director notes</div>
            <div className="mt-1 text-[8px] leading-4 text-[#918B83]">Click any note to return the governed cut to its exact timeline position. Mastering remains locked until every note is resolved and the current cut is approved.</div>
          </div>

          <div className="border-b border-black/[0.06] p-4">
            <div className="flex items-center justify-between"><span className="text-[7px] font-semibold uppercase tracking-[0.1em] text-[#918B83]">New note</span><span className="inline-flex items-center gap-1 text-[8px] tabular-nums text-[#76583A]"><Clock3 size={8} /> {timecode(playhead)}</span></div>
            <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={4} placeholder="What needs to change at this exact moment?" className="mt-2 w-full resize-none rounded-lg border border-black/[0.08] bg-[#FAF9F7] p-3 text-[9px] leading-4 outline-none placeholder:text-[#B2ABA3] focus:border-[#A37849]/30" />
            <button type="button" onClick={addComment} disabled={!note.trim() || Boolean(working) || !timeline?.id} className="mt-2 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-[#25231F] px-3 text-[8px] font-semibold text-white disabled:opacity-35">{working === "comment" ? <Loader2 size={9} className="animate-spin" /> : <MessageSquareText size={9} />} Add review note</button>
          </div>

          <div className="border-b border-black/[0.06] p-4">
            <div className="flex items-center justify-between"><span className="text-[8px] font-semibold text-[#49443F]">Open notes</span><span className="rounded-full bg-amber-50 px-2 py-1 text-[7px] font-semibold text-amber-800">{openComments.length}</span></div>
            <div className="mt-3 space-y-2">
              {openComments.map((comment) => (
                <div key={comment.id} className="rounded-xl border border-amber-700/10 bg-amber-50/50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <button type="button" onClick={() => setPlayhead(finite(comment.metadata?.timecode_seconds, 0))} className="inline-flex items-center gap-1 text-[8px] font-semibold tabular-nums text-amber-900 hover:underline"><Clock3 size={8} /> {timecode(comment.metadata?.timecode_seconds)}</button>
                    <button type="button" onClick={() => resolveComment(comment)} disabled={Boolean(working)} className="inline-flex items-center gap-1 text-[7px] font-semibold text-emerald-800 disabled:opacity-40">{working === `resolve:${comment.id}` ? <Loader2 size={8} className="animate-spin" /> : <Check size={8} />} Resolve</button>
                  </div>
                  <button type="button" onClick={() => setPlayhead(finite(comment.metadata?.timecode_seconds, 0))} className="mt-1.5 block w-full text-left text-[8px] leading-4 text-[#665E55]">{comment.metadata?.body || comment.description}</button>
                </div>
              ))}
              {!openComments.length ? <div className="rounded-xl border border-emerald-700/10 bg-emerald-50/50 p-3 text-[8px] text-emerald-800"><CheckCircle2 size={10} className="mb-1" />No unresolved review notes.</div> : null}
            </div>
          </div>

          {resolvedComments.length ? (
            <div className="border-b border-black/[0.06] p-4">
              <div className="text-[8px] font-semibold text-[#49443F]">Resolved notes</div>
              <div className="mt-2 space-y-2">{resolvedComments.slice(0, 8).map((comment) => <button type="button" onClick={() => setPlayhead(finite(comment.metadata?.timecode_seconds, 0))} key={comment.id} className="block w-full rounded-lg border border-black/[0.06] p-2.5 text-left"><div className="flex items-center gap-1 text-[7px] font-semibold text-emerald-800"><CheckCircle2 size={8} /> {timecode(comment.metadata?.timecode_seconds)}</div><div className="mt-1 line-clamp-2 text-[7px] leading-3 text-[#817B73]">{comment.metadata?.body || comment.description}</div></button>)}</div>
            </div>
          ) : null}

          {!review?.can_approve && timeline ? (
            <div className="m-4 rounded-xl border border-amber-700/10 bg-amber-50 p-3">
              <div className="flex items-start gap-2"><AlertTriangle size={11} className="mt-0.5 shrink-0 text-amber-700" /><div><div className="text-[8px] font-semibold text-amber-950">Approval locked</div><div className="mt-1 text-[7px] leading-3 text-amber-900/70">Resolve {review?.open_comment_count || 0} notes and {review?.missing_requirement_count || 0} missing edit requirements first.</div></div></div>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
