"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clapperboard,
  FileCheck2,
  Film,
  Gauge,
  Headphones,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Subtitles,
  Volume2,
} from "lucide-react";

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function bytes(value) {
  const amount = finite(value);
  if (amount === null) return "—";
  if (amount < 1024) return `${amount} B`;
  if (amount < 1024 ** 2) return `${(amount / 1024).toFixed(1)} KB`;
  if (amount < 1024 ** 3) return `${(amount / 1024 ** 2).toFixed(1)} MB`;
  return `${(amount / 1024 ** 3).toFixed(2)} GB`;
}

function duration(value) {
  const seconds = finite(value);
  if (seconds === null) return "—";
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds - minutes * 60;
  return minutes ? `${minutes}:${String(Math.round(remainder)).padStart(2, "0")}` : `${seconds.toFixed(1)}s`;
}

function label(value) {
  return String(value || "—").replaceAll("_", " ");
}

function statusTone(status = "") {
  const value = String(status).toUpperCase();
  if (["APPROVED", "COMPLETED", "DERIVED", "GENERATED", "READY"].includes(value)) return "border-emerald-700/15 bg-emerald-50 text-emerald-800";
  if (["REVIEW", "READY_FOR_APPROVAL", "REVIEW_REQUIRED"].includes(value)) return "border-amber-700/15 bg-amber-50 text-amber-800";
  if (["REJECTED", "FAILED", "BLOCKED"].some((item) => value.includes(item))) return "border-red-700/15 bg-red-50 text-red-800";
  return "border-black/[0.08] bg-[#F5F3EF] text-[#777067]";
}

function EvidenceState({ passed, children }) {
  return (
    <div className="flex items-start gap-2">
      {passed ? <CheckCircle2 size={11} className="mt-0.5 shrink-0 text-emerald-700" /> : <AlertTriangle size={11} className="mt-0.5 shrink-0 text-amber-700" />}
      <span className="text-[8px] leading-4 text-[#69635C]">{children}</span>
    </div>
  );
}

function technicalRows(mastering) {
  const technical = mastering?.render?.technical || {};
  const profile = mastering?.render?.export_profile || {};
  return [
    ["Frame", technical.width && technical.height ? `${technical.width} × ${technical.height}` : "—", profile.width && profile.height ? `${profile.width} × ${profile.height}` : null],
    ["Frame rate", technical.frame_rate ? `${technical.frame_rate} fps` : "—", profile.frame_rate || profile.frameRate ? `${profile.frame_rate || profile.frameRate} fps` : null],
    ["Video codec", technical.video_codec || "—", profile.video_codec || profile.videoCodec || null],
    ["Audio codec", technical.audio_codec || "—", profile.audio_codec || profile.audioCodec || null],
    ["Sample rate", technical.sample_rate ? `${technical.sample_rate} Hz` : "—", profile.sample_rate || profile.sampleRate ? `${profile.sample_rate || profile.sampleRate} Hz` : null],
    ["Duration", duration(technical.duration_seconds), mastering?.timeline?.duration_seconds ? duration(mastering.timeline.duration_seconds) : null],
    ["File", bytes(technical.file_size_bytes), null],
  ];
}

export default function RenderWorkspace({ runtime, editor }) {
  const project = runtime.projectRuntime?.current || null;
  const [mastering, setMastering] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const inspect = useCallback(async ({ quiet = false } = {}) => {
    if (!project?.id || !runtime.organizationId) return;
    if (!quiet) setLoading(true);
    setError("");
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
      if (!response.ok || result.success === false) throw new Error(result.error || "Mastering inspection failed");
      setMastering(result.mastering || null);
    } catch (inspectError) {
      setError(inspectError.message || "Mastering inspection failed");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [project?.id, runtime.organizationId]);

  useEffect(() => {
    inspect();
  }, [inspect]);

  async function runMastering() {
    if (!project?.id || working) return;
    setWorking("mastering");
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/creative/post-production/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organization_id: runtime.organizationId,
          creative_project_id: project.id,
        }),
      });
      const result = await response.json();
      if (!response.ok || result.success === false) throw new Error(result.error || "Mastering could not run");
      setMessage(`Mastering result · ${label(result.status)}`);
      await inspect({ quiet: true });
      await runtime.refresh?.();
    } catch (runError) {
      setError(runError.message || "Mastering could not run");
    } finally {
      setWorking("");
    }
  }

  async function refreshReadiness() {
    if (!project?.id || working) return;
    setWorking("readiness");
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/creative/release/readiness", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organization_id: runtime.organizationId,
          creative_project_id: project.id,
          timeline_asset_node_id: mastering?.timeline?.id || null,
          final_render_asset_node_id: mastering?.render?.id || null,
          force: true,
        }),
      });
      const result = await response.json();
      if (!response.ok || result.success === false) throw new Error(result.error || "Release readiness failed");
      setMessage(result.report?.metadata?.passed ? "Release readiness passed" : "Release readiness refreshed · blockers remain");
      await inspect({ quiet: true });
    } catch (readinessError) {
      setError(readinessError.message || "Release readiness failed");
    } finally {
      setWorking("");
    }
  }

  async function approveMaster() {
    if (!mastering?.render?.id || working) return;
    setWorking("approve");
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/creative/release/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organization_id: runtime.organizationId,
          subject_asset_node_id: mastering.render.id,
          scope: "FINAL_RENDER",
          notes: "Approved in Video Studio Mastering after human master review.",
        }),
      });
      const result = await response.json();
      if (!response.ok || result.success === false) throw new Error(result.error || "Final master approval failed");
      setMessage("Final master approved · authenticated approval recorded");
      await refreshReadiness();
      await runtime.refresh?.();
    } catch (approvalError) {
      setError(approvalError.message || "Final master approval failed");
    } finally {
      setWorking("");
    }
  }

  const technical = useMemo(() => technicalRows(mastering), [mastering]);
  const render = mastering?.render || null;
  const release = mastering?.release || {};
  const quality = mastering?.quality || {};
  const profiles = mastering?.configured_profiles || [];
  const failedChecks = release.failed_checks || [];
  const technicalPassed = quality.technical?.passed === true;
  const perceptualPassed = quality.perceptual?.passed === true;
  const semanticPassed = quality.semantic?.passed === true;
  const audioIntegrity = mastering?.audio?.master_integrity || {};
  const approved = Boolean(release.final_render_approval);

  if (loading) {
    return <div className="flex h-full items-center justify-center bg-[#F6F3EE] text-[#726B63]"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> <span className="text-[9px]">Inspecting master evidence…</span></div>;
  }

  return (
    <div className="h-full overflow-auto bg-[#F6F3EE] text-[#2A2723]">
      <div className="sticky top-0 z-20 border-b border-black/[0.07] bg-[#F6F3EE]/95 px-4 py-3 backdrop-blur-sm lg:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[7px] font-semibold uppercase tracking-[0.14em] text-[#8A633C]">Mastering room</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              <h2 className="truncate text-[15px] font-semibold tracking-[-0.02em]">{mastering?.project?.name || project?.name || "Final master"}</h2>
              <span className="text-[8px] text-[#817B73]">{render ? `${render.technical?.width || "—"}×${render.technical?.height || "—"} · ${duration(render.technical?.duration_seconds)}` : "No master render"}</span>
              <span className={`rounded-full border px-2 py-1 text-[7px] font-semibold ${statusTone(render?.status || "NOT RENDERED")}`}>{label(render?.status || "NOT RENDERED")}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => editor?.setActiveWorkspace?.("timeline")} className="h-8 rounded-lg border border-black/[0.08] bg-white px-3 text-[8px] font-semibold text-[#716B63]">Edit desk</button>
            <button type="button" onClick={() => inspect()} disabled={Boolean(working)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-3 text-[8px] font-semibold text-[#716B63] disabled:opacity-40"><RefreshCw size={8} className={working === "readiness" ? "animate-spin" : ""} /> Refresh</button>
            <button type="button" onClick={runMastering} disabled={!mastering?.can_run_mastering || Boolean(working)} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#25231F] px-3 text-[8px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-35">{working === "mastering" ? <Loader2 size={9} className="animate-spin" /> : <Clapperboard size={9} />} {render ? "Re-run mastering" : "Build master"}</button>
          </div>
        </div>
        {message ? <div className="mt-2 rounded-lg border border-emerald-700/10 bg-emerald-50 px-3 py-2 text-[8px] text-emerald-800">{message}</div> : null}
        {error ? <div className="mt-2 rounded-lg border border-red-700/10 bg-red-50 px-3 py-2 text-[8px] text-red-800">{error}</div> : null}
      </div>

      <div className="grid min-h-[760px] xl:grid-cols-[minmax(0,1fr)_330px]">
        <main className="min-w-0 border-r border-black/[0.07] p-4 lg:p-5">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Technical QC", technicalPassed ? "PASS" : render ? "HOLD" : "—", Gauge],
              ["Perceptual QC", quality.perceptual ? (perceptualPassed ? "PASS" : "HOLD") : "NOT RUN", Sparkles],
              ["Audio tracks", mastering?.audio?.track_count ?? 0, Headphones],
              ["Delivery profiles", profiles.length, FileCheck2],
            ].map(([name, value, Icon]) => <div key={name} className="rounded-xl border border-black/[0.07] bg-white px-3 py-3"><div className="flex items-center gap-1.5 text-[7px] font-semibold uppercase tracking-[0.1em] text-[#918B83]"><Icon size={9} /> {name}</div><div className="mt-1 text-[14px] font-semibold tabular-nums text-[#403C37]">{value}</div></div>)}
          </div>

          <section className="mt-3 overflow-hidden rounded-xl border border-black/[0.08] bg-[#211F1C] shadow-sm">
            <div className="flex min-h-[430px] items-center justify-center">
              {render?.preview_url ? <video src={render.preview_url} controls preload="metadata" className="max-h-[680px] w-full object-contain" /> : <div className="max-w-md px-8 text-center text-white"><Film className="mx-auto h-7 w-7 text-white/30" /><div className="mt-3 text-[10px] font-semibold text-white/70">{render ? "Master exists, but preview is unavailable" : "No final master exists yet"}</div><div className="mt-1 text-[8px] leading-4 text-white/40">{render?.preview_error || (mastering?.can_run_mastering ? "Build the governed master from the approved production chain." : "Production must settle before mastering can start.")}</div></div>}
            </div>
            <div className="border-t border-white/10 bg-black/20 px-4 py-3 text-white">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-[7px] font-semibold uppercase tracking-[0.1em] text-white/35">Master preview</div><div className="mt-0.5 text-[10px] font-semibold text-white/80">{render?.name || "Final render"}</div></div><div className="text-right text-[8px] text-white/45">{render?.export_profile?.name || render?.export_profile?.id || "No export profile"}</div></div>
            </div>
          </section>

          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <section className="overflow-hidden rounded-xl border border-black/[0.07] bg-white">
              <div className="border-b border-black/[0.06] px-4 py-3"><div className="flex items-center gap-1.5 text-[7px] font-semibold uppercase tracking-[0.11em] text-[#8A633C]"><Gauge size={9} /> Technical master</div><div className="mt-0.5 text-[9px] text-[#716B63]">Measured render against its governed delivery profile</div></div>
              <div className="divide-y divide-black/[0.055]">{technical.map(([name, actual, expected]) => <div key={name} className="grid grid-cols-[110px_minmax(0,1fr)_minmax(0,1fr)] gap-2 px-4 py-2.5 text-[8px]"><span className="text-[#918B83]">{name}</span><span className="font-semibold text-[#48433E]">{actual}</span><span className="text-right text-[#918B83]">{expected ? `target ${expected}` : ""}</span></div>)}</div>
              {quality.technical?.failed_checks?.length ? <div className="border-t border-red-700/10 bg-red-50 px-4 py-3 text-[8px] text-red-800">Failed: {quality.technical.failed_checks.map(label).join(" · ")}</div> : null}
            </section>

            <section className="overflow-hidden rounded-xl border border-black/[0.07] bg-white">
              <div className="border-b border-black/[0.06] px-4 py-3"><div className="flex items-center gap-1.5 text-[7px] font-semibold uppercase tracking-[0.11em] text-[#8A633C]"><Volume2 size={9} /> Sound & captions</div><div className="mt-0.5 text-[9px] text-[#716B63]">Master tracks actually included by the post-production graph</div></div>
              <div className="p-4">
                <div className="space-y-2">{(mastering?.audio?.tracks || []).map((track) => <div key={track.id} className="flex items-center justify-between gap-3 rounded-lg border border-black/[0.06] bg-[#FBFAF8] px-3 py-2"><div className="min-w-0"><div className="truncate text-[8px] font-semibold text-[#49443F]">{track.name}</div><div className="mt-0.5 text-[7px] text-[#918B83]">{label(track.role)} · gain {track.gain ?? "—"}</div></div><span className="text-[7px] text-[#76583A]">{duration(track.duration_seconds)}</span></div>)}{!mastering?.audio?.track_count ? <div className="text-[8px] leading-4 text-[#918B83]">No external voice, music or SFX tracks are attached to the master graph.</div> : null}</div>
                <div className="mt-3 flex items-center justify-between border-t border-black/[0.06] pt-3"><div className="flex items-center gap-1.5 text-[8px] text-[#716B63]"><Subtitles size={9} /> Captions</div><span className="text-[8px] font-semibold text-[#49443F]">{mastering?.audio?.subtitle_count || 0}</span></div>
                {audioIntegrity.required ? <div className="mt-3 rounded-lg border border-black/[0.06] bg-[#FBFAF8] p-3"><EvidenceState passed={audioIntegrity.integrity_passed && audioIntegrity.verified}>Approved master soundtrack integrity {audioIntegrity.integrity_passed && audioIntegrity.verified ? "was verified after finishing." : "still requires post-finishing verification."}</EvidenceState></div> : null}
              </div>
            </section>
          </div>

          <section className="mt-3 overflow-hidden rounded-xl border border-black/[0.07] bg-white">
            <div className="flex items-center justify-between gap-3 border-b border-black/[0.06] px-4 py-3"><div><div className="text-[7px] font-semibold uppercase tracking-[0.11em] text-[#8A867F]">Delivery masters</div><div className="mt-0.5 text-[9px] text-[#716B63]">Project-governed outputs by channel and profile</div></div><span className="text-[8px] text-[#918B83]">{profiles.length} configured</span></div>
            <div className="grid gap-2 p-3 md:grid-cols-2 xl:grid-cols-3">{profiles.map((profile) => <div key={profile.id} className="rounded-xl border border-black/[0.07] bg-[#FCFBF8] p-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate text-[9px] font-semibold text-[#403C37]">{profile.name}</div><div className="mt-0.5 text-[7px] text-[#918B83]">{profile.width && profile.height ? `${profile.width}×${profile.height}` : "—"} · {profile.frame_rate ? `${profile.frame_rate} fps` : "—"}</div></div><span className={`rounded-full border px-1.5 py-0.5 text-[6px] font-semibold ${statusTone(profile.render_status || "NOT RENDERED")}`}>{profile.render_id ? label(profile.render_status) : "NOT RENDERED"}</span></div><div className="mt-3 text-[7px] leading-4 text-[#817B73]">{profile.video_codec || "codec —"} · {profile.audio_codec || "audio —"} · {profile.container || "container —"}</div><div className="mt-2 text-[7px] text-[#A09A92]">{profile.channels?.length ? profile.channels.join(" · ") : profile.default ? "Default profile" : "Project profile"}</div></div>)}{!profiles.length ? <div className="col-span-full rounded-lg border border-amber-700/12 bg-amber-50 p-3 text-[8px] text-amber-900">No project export profiles are configured. Post-production will fail closed rather than invent delivery settings.</div> : null}</div>
          </section>
        </main>

        <aside className="bg-white">
          <div className="border-b border-black/[0.06] px-4 py-3"><div className="flex items-center gap-1.5 text-[7px] font-semibold uppercase tracking-[0.12em] text-[#8A633C]"><ShieldCheck size={9} /> Release evidence</div><div className="mt-1 text-[11px] font-semibold text-[#403C37]">Master decision</div><div className="mt-1 text-[8px] leading-4 text-[#918B83]">Publishing is separate. This room only proves and approves the master.</div></div>

          <div className={`border-b px-4 py-3 ${release.passed && approved ? "border-emerald-700/10 bg-emerald-50/60" : "border-amber-700/10 bg-amber-50/60"}`}><div className="flex items-start gap-2">{release.passed && approved ? <CheckCircle2 size={13} className="mt-0.5 text-emerald-700" /> : <AlertTriangle size={13} className="mt-0.5 text-amber-700" />}<div><div className={`text-[9px] font-semibold ${release.passed && approved ? "text-emerald-900" : "text-amber-950"}`}>{release.passed && approved ? "Master approved and release-ready" : approved ? "Approved master still has release blockers" : "Master approval required"}</div><div className={`mt-1 text-[8px] leading-4 ${release.passed && approved ? "text-emerald-800/70" : "text-amber-900/70"}`}>{release.passed && approved ? "All readiness checks are green. Publishing remains an explicit governed step." : "Review the master and evidence below; Avantiqo will not publish from cosmetic status alone."}</div></div></div></div>

          <div className="p-4">
            <div className="space-y-2">
              <EvidenceState passed={Boolean(mastering?.timeline) && !(mastering?.timeline?.missing_requirements || []).length}>Timeline complete · {(mastering?.timeline?.missing_requirements || []).length} unresolved requirements</EvidenceState>
              <EvidenceState passed={Boolean(render) && render.status !== "REJECTED"}>Final render {render ? label(render.status) : "missing"}</EvidenceState>
              <EvidenceState passed={technicalPassed}>Technical QC {technicalPassed ? "passed" : "not passed"}</EvidenceState>
              <EvidenceState passed={!quality.perceptual || perceptualPassed}>Perceptual QC {quality.perceptual ? (perceptualPassed ? "passed" : "requires attention") : "not required / not present"}</EvidenceState>
              <EvidenceState passed={!quality.semantic || semanticPassed}>Semantic quality {quality.semantic ? (semanticPassed ? "passed" : "requires attention") : "not present"}</EvidenceState>
              <EvidenceState passed={!mastering?.repair?.open}>Repair plan {mastering?.repair?.open ? "is still open" : "clear"}</EvidenceState>
              <EvidenceState passed={approved}>Authenticated human master approval {approved ? "recorded" : "not recorded"}</EvidenceState>
            </div>

            {failedChecks.length ? <div className="mt-4 rounded-xl border border-red-700/12 bg-red-50 p-3"><div className="text-[8px] font-semibold text-red-950">Release blockers</div><div className="mt-2 space-y-1 text-[7px] leading-4 text-red-900/70">{failedChecks.map((check) => <div key={check}>• {label(check)}</div>)}</div></div> : null}

            <div className="mt-4 grid gap-2">
              <button type="button" onClick={refreshReadiness} disabled={!render || Boolean(working)} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-3 text-[8px] font-semibold text-[#5F5952] disabled:opacity-35">{working === "readiness" ? <Loader2 size={9} className="animate-spin" /> : <RefreshCw size={9} />} Re-run release audit</button>
              <button type="button" onClick={approveMaster} disabled={!mastering?.can_approve_final_render || Boolean(working)} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#25231F] px-3 text-[8px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-35">{working === "approve" ? <Loader2 size={9} className="animate-spin" /> : <ShieldCheck size={9} />} {approved ? "Master approved" : "Approve final master"}</button>
              <button type="button" onClick={() => editor?.setActiveWorkspace?.("publishing")} disabled={!mastering?.can_open_publishing} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#A37849]/15 bg-[#F5EEE5] px-3 text-[8px] font-semibold text-[#76583A] disabled:cursor-not-allowed disabled:opacity-35">Open publishing <ChevronRight size={9} /></button>
            </div>

            <div className="mt-4 border-t border-black/[0.06] pt-3"><div className="text-[7px] font-semibold uppercase tracking-[0.1em] text-[#918B83]">Audit identity</div><div className="mt-2 space-y-1.5 text-[7px] text-[#817B73]"><div className="flex justify-between gap-3"><span>Timeline</span><span className="max-w-[150px] truncate font-mono text-[#49443F]">{mastering?.timeline?.id || "—"}</span></div><div className="flex justify-between gap-3"><span>Render</span><span className="max-w-[150px] truncate font-mono text-[#49443F]">{render?.id || "—"}</span></div><div className="flex justify-between gap-3"><span>Checksum</span><span className="max-w-[150px] truncate font-mono text-[#49443F]">{render?.technical?.checksum || "—"}</span></div></div></div>
          </div>
        </aside>
      </div>
    </div>
  );
}
