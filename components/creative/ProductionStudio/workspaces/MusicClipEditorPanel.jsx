"use client";

import { useState } from "react";
import { Copy, MoveHorizontal, Scissors, Volume2 } from "lucide-react";

import {
  duplicateMusicClip,
  moveMusicClip,
  replaceClipInTrack,
  setMusicClipFades,
  setMusicClipGain,
  splitMusicClip,
  trimMusicClipEnd,
  trimMusicClipStart,
  validateMusicClipEdit,
} from "@/lib/creative/music/runtime/CreativeMusicClipEditRuntime";
import { isLanguageAudioRole, normalizeAudioPostClipEditorial } from "@/lib/creative/music/runtime/CreativeAudioPostEditorialRuntime";

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function Field({ label, children }) {
  return <label className="block"><div className="mb-1 text-[8px] uppercase tracking-[0.14em] text-white/22">{label}</div>{children}</label>;
}

function snappedSeconds(value, bpm, snap) {
  const seconds = Math.max(0, finite(value, 0));
  if (String(snap || "off").toLowerCase() !== "beat") return seconds;
  const beatSeconds = 60 / Math.max(30, Math.min(300, finite(bpm, 96)));
  return Math.max(0, Math.round(seconds / beatSeconds) * beatSeconds);
}

export default function MusicClipEditorPanel({
  organizationId,
  projectId,
  track,
  clipId,
  playhead = 0,
  bpm = 96,
  snap = "off",
  frameRate = 24,
  disabled = false,
  onChange,
  onSelectClip,
}) {
  const [dialogueMatch, setDialogueMatch] = useState(null);
  const [dialogueMatchBusy, setDialogueMatchBusy] = useState(false);
  const [dialogueMatchError, setDialogueMatchError] = useState("");
  const [dialogueMatchOverride, setDialogueMatchOverride] = useState(false);
  const clip = track?.clips?.find((entry) => entry.id === clipId) || null;
  if (!track || !clip) return null;
  const start = finite(clip.start_seconds, 0);
  const duration = Math.max(0.001, finite(clip.duration_seconds, 0.001));
  const end = start + duration;
  const editPlayhead = snappedSeconds(playhead, bpm, snap);
  const playheadInside = editPlayhead > start && editPlayhead < end;
  const beatSeconds = 60 / Math.max(30, Math.min(300, finite(bpm, 96)));
  const beatSnap = String(snap || "off").toLowerCase() === "beat";
  const languageRole = isLanguageAudioRole(track.audio_role);
  const postEdit = languageRole ? normalizeAudioPostClipEditorial(clip.audio_post || {}, { frame_rate: frameRate, timeline_start_seconds: start }) : null;
  function updatePost(values) { if (!languageRole) return; updateDirect({ ...clip, audio_post: normalizeAudioPostClipEditorial({ ...postEdit, ...values }, { frame_rate: frameRate, timeline_start_seconds: start }), preserve_source_asset: true, destructive_edit: false }); }

  async function runDialogueMatch(action = "analyze") {
    if (track.audio_role !== "ADR" || !postEdit?.production_match_asset_id || !clip.source_asset_id || dialogueMatchBusy) return;
    setDialogueMatchBusy(true); setDialogueMatchError("");
    try {
      const response = await fetch("/api/creative/music/dialogue-match", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({
        action, organization_id:organizationId, creative_project_id:projectId, production_asset_id:postEdit.production_match_asset_id, adr_asset_id:clip.source_asset_id, room_tone_asset_id:postEdit.room_tone_asset_id || null, editorial:postEdit,
        approval: action === "approve" ? { plan_fingerprint:dialogueMatch?.plan?.plan_fingerprint, level_match_approved:true, tonal_match_approved:true, room_tone_continuity_approved:true, perspective_match_approved:true, override_warnings:dialogueMatchOverride, note:postEdit.continuity_note || null } : undefined,
      }) });
      const body = await response.json();
      if (!response.ok || body.success === false) throw new Error(body.error || "Dialogue match failed");
      setDialogueMatch(body);
      if (body.approval?.status === "APPROVED") updatePost({ dialogue_match_plan_fingerprint:body.approval.plan_fingerprint, dialogue_match_approved:true, dialogue_match_approved_at:body.approval.approved_at });
    } catch (cause) { setDialogueMatchError(cause?.message || "Dialogue match failed"); } finally { setDialogueMatchBusy(false); }
  }

  function commit(replacement, selectId = null) {
    const next = replaceClipInTrack(track, clip.id, replacement);
    validateMusicClipEdit(next);
    onChange?.(next);
    if (selectId) onSelectClip?.(selectId);
  }

  function updateDirect(nextClip) {
    commit(nextClip, nextClip.id);
  }

  function setMuted(value) {
    updateDirect({ ...clip, muted: value, preserve_source_asset: true, destructive_edit: false });
  }

  function trimLeft() {
    if (!playheadInside) return;
    updateDirect(trimMusicClipStart(clip, editPlayhead));
  }

  function trimRight() {
    if (!playheadInside) return;
    updateDirect(trimMusicClipEnd(clip, editPlayhead));
  }

  function split() {
    if (!playheadInside) return;
    const { left, right } = splitMusicClip(clip, editPlayhead);
    commit([left, right], right.id);
  }

  function duplicate() {
    const copy = duplicateMusicClip(clip);
    const next = structuredClone(track);
    const index = next.clips.findIndex((entry) => entry.id === clip.id);
    next.clips.splice(index + 1, 0, copy);
    validateMusicClipEdit(next);
    onChange?.(next);
    onSelectClip?.(copy.id);
  }

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.018] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#d6a66a]/65"><Scissors className="h-3.5 w-3.5" /> Clip editor</div>
          <div className="mt-1 text-[9px] text-white/25">Non-destructive source reference</div>
        </div>
        <label className="flex items-center gap-2 text-[9px] text-white/35"><input type="checkbox" checked={clip.muted === true} disabled={disabled} onChange={(event) => setMuted(event.target.checked)} className="accent-[#d6a66a]" /> Mute</label>
      </div>

      <div className="mt-3 rounded-lg border border-white/6 bg-black/15 px-3 py-2 text-[8px] text-white/25">Grid: {beatSnap ? `Beat · ${finite(bpm, 96)} BPM · ${beatSeconds.toFixed(3)}s` : "Free seconds"}{beatSnap && Math.abs(editPlayhead - finite(playhead, 0)) > 0.0005 ? ` · playhead snaps ${finite(playhead, 0).toFixed(3)} → ${editPlayhead.toFixed(3)}s` : ""}</div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Field label="Timeline start">
          <input type="number" step={beatSnap ? beatSeconds : 0.01} min="0" disabled={disabled} value={Number(start.toFixed(3))} onChange={(event) => updateDirect(moveMusicClip(clip, snappedSeconds(event.target.value, bpm, snap)))} className="w-full rounded-lg border border-white/8 bg-black/25 px-2 py-2 text-[10px] text-white/55 disabled:opacity-25" />
        </Field>
        <Field label="Source offset">
          <div className="rounded-lg border border-white/6 bg-black/15 px-2 py-2 text-[10px] text-white/30">{finite(clip.source_offset_seconds, 0).toFixed(3)} s</div>
        </Field>
        <Field label="Duration">
          <div className="rounded-lg border border-white/6 bg-black/15 px-2 py-2 text-[10px] text-white/30">{duration.toFixed(3)} s</div>
        </Field>
        <Field label="End">
          <div className="rounded-lg border border-white/6 bg-black/15 px-2 py-2 text-[10px] text-white/30">{end.toFixed(3)} s</div>
        </Field>
      </div>

      <div className="mt-4 space-y-3">
        <Field label="Clip gain">
          <div className="flex items-center gap-2"><Volume2 className="h-3.5 w-3.5 text-white/25" /><input type="range" min="-60" max="24" step="0.5" disabled={disabled} value={finite(clip.gain_db, 0)} onChange={(event) => updateDirect(setMusicClipGain(clip, event.target.value))} className="w-full accent-[#d6a66a] disabled:opacity-25" /><span className="w-14 text-right text-[9px] text-white/30">{finite(clip.gain_db, 0).toFixed(1)} dB</span></div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fade in">
            <input type="number" min="0" max={duration / 2} step="0.01" disabled={disabled} value={finite(clip.fade_in_seconds, 0)} onChange={(event) => updateDirect(setMusicClipFades(clip, { fade_in_seconds: event.target.value }))} className="w-full rounded-lg border border-white/8 bg-black/25 px-2 py-2 text-[10px] text-white/55 disabled:opacity-25" />
          </Field>
          <Field label="Fade out">
            <input type="number" min="0" max={duration / 2} step="0.01" disabled={disabled} value={finite(clip.fade_out_seconds, 0)} onChange={(event) => updateDirect(setMusicClipFades(clip, { fade_out_seconds: event.target.value }))} className="w-full rounded-lg border border-white/8 bg-black/25 px-2 py-2 text-[10px] text-white/55 disabled:opacity-25" />
          </Field>
        </div>
      </div>

      {languageRole ? <div className="mt-4 rounded-xl border border-[#d6a66a]/12 bg-[#d6a66a]/[0.02] p-3"><div className="flex items-center justify-between gap-2"><div><div className="text-[8px] font-semibold uppercase tracking-[0.15em] text-[#efd29f]/55">Audio Post editorial · {track.audio_role}</div><div className="mt-1 text-[7px] text-white/18">Picture sync and dialogue metadata stay attached to this non-destructive clip reference.</div></div><label className="flex items-center gap-1.5 text-[7px] text-white/28"><input type="checkbox" disabled={disabled} checked={postEdit.dialogue_edit_approved===true} onChange={e=>updatePost({dialogue_edit_approved:e.target.checked})} className="accent-[#d6a66a]"/> Edit approved</label></div><div className="mt-3 grid grid-cols-2 gap-2"><Field label="Language"><input disabled={disabled} value={postEdit.language} onChange={e=>updatePost({language:e.target.value})} className="w-full rounded-lg border border-white/8 bg-black/25 px-2 py-2 text-[9px] text-white/55"/></Field><Field label="Speaker / character"><input disabled={disabled} value={postEdit.speaker || postEdit.character || ""} onChange={e=>updatePost({speaker:e.target.value})} className="w-full rounded-lg border border-white/8 bg-black/25 px-2 py-2 text-[9px] text-white/55"/></Field><Field label="Scene"><input disabled={disabled} value={postEdit.scene_id || ""} onChange={e=>updatePost({scene_id:e.target.value})} className="w-full rounded-lg border border-white/8 bg-black/25 px-2 py-2 text-[9px] text-white/55"/></Field><Field label="Line / cue"><input disabled={disabled} value={postEdit.line_id || ""} onChange={e=>updatePost({line_id:e.target.value})} className="w-full rounded-lg border border-white/8 bg-black/25 px-2 py-2 text-[9px] text-white/55"/></Field><Field label="Take"><input disabled={disabled} value={postEdit.take_id || ""} onChange={e=>updatePost({take_id:e.target.value})} className="w-full rounded-lg border border-white/8 bg-black/25 px-2 py-2 text-[9px] text-white/55"/></Field><Field label="ADR status"><select disabled={disabled} value={postEdit.adr_status} onChange={e=>updatePost({adr_status:e.target.value})} className="w-full rounded-lg border border-white/8 bg-[#0a0a0a] px-2 py-2 text-[9px] text-white/55">{["NONE","NEEDED","CUED","RECORDED","EDITED","APPROVED"].map(v=><option key={v} value={v}>{v}</option>)}</select></Field><Field label="Sync frame"><input disabled={disabled} type="number" min="0" step="1" value={postEdit.sync_frame} onChange={e=>updatePost({sync_frame:Number(e.target.value)})} className="w-full rounded-lg border border-white/8 bg-black/25 px-2 py-2 text-[9px] text-white/55"/><div className="mt-1 text-[7px] text-white/18">{postEdit.sync_timecode}</div></Field><Field label="Tolerance frames"><input disabled={disabled} type="number" min="0" max="24" step="1" value={postEdit.sync_tolerance_frames} onChange={e=>updatePost({sync_tolerance_frames:Number(e.target.value)})} className="w-full rounded-lg border border-white/8 bg-black/25 px-2 py-2 text-[9px] text-white/55"/></Field><Field label="Pre-handle frames"><input disabled={disabled} type="number" min="0" max="240" step="1" value={postEdit.pre_handle_frames} onChange={e=>updatePost({pre_handle_frames:Number(e.target.value)})} className="w-full rounded-lg border border-white/8 bg-black/25 px-2 py-2 text-[9px] text-white/55"/></Field><Field label="Post-handle frames"><input disabled={disabled} type="number" min="0" max="240" step="1" value={postEdit.post_handle_frames} onChange={e=>updatePost({post_handle_frames:Number(e.target.value)})} className="w-full rounded-lg border border-white/8 bg-black/25 px-2 py-2 text-[9px] text-white/55"/></Field><Field label="Room tone asset"><input disabled={disabled} value={postEdit.room_tone_asset_id || ""} onChange={e=>updatePost({room_tone_asset_id:e.target.value || null})} placeholder="asset id" className="w-full rounded-lg border border-white/8 bg-black/25 px-2 py-2 text-[9px] text-white/55"/></Field><Field label="Continuity note"><input disabled={disabled} value={postEdit.continuity_note || ""} onChange={e=>updatePost({continuity_note:e.target.value})} className="w-full rounded-lg border border-white/8 bg-black/25 px-2 py-2 text-[9px] text-white/55"/></Field>{track.audio_role === "ADR" ? <><Field label="Production line asset"><input disabled={disabled} value={postEdit.production_match_asset_id || ""} onChange={e=>updatePost({production_match_asset_id:e.target.value || null,dialogue_match_approved:false,dialogue_match_plan_fingerprint:null})} placeholder="production dialogue asset id" className="w-full rounded-lg border border-white/8 bg-black/25 px-2 py-2 text-[9px] text-white/55"/></Field><Field label="Production perspective"><select disabled={disabled} value={postEdit.production_perspective || "MEDIUM"} onChange={e=>updatePost({production_perspective:e.target.value,dialogue_match_approved:false})} className="w-full rounded-lg border border-white/8 bg-[#0a0a0a] px-2 py-2 text-[9px] text-white/55">{["CLOSE","MEDIUM","FAR","OFFSCREEN"].map(v=><option key={v} value={v}>{v}</option>)}</select></Field><Field label="ADR perspective"><select disabled={disabled} value={postEdit.adr_perspective || "CLOSE"} onChange={e=>updatePost({adr_perspective:e.target.value,dialogue_match_approved:false})} className="w-full rounded-lg border border-white/8 bg-[#0a0a0a] px-2 py-2 text-[9px] text-white/55">{["CLOSE","MEDIUM","FAR","OFFSCREEN"].map(v=><option key={v} value={v}>{v}</option>)}</select></Field></> : null}</div>{track.audio_role === "ADR" ? <div className="mt-3 rounded-lg border border-white/7 bg-black/20 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><div className="text-[7px] font-semibold uppercase tracking-[0.13em] text-white/34">Dialogue / ADR acoustic match</div><div className="mt-1 text-[7px] text-white/18">Measured production-vs-ADR continuity. Original take stays untouched.</div></div><div className="flex gap-2"><button type="button" disabled={disabled || dialogueMatchBusy || !postEdit.production_match_asset_id || !clip.source_asset_id} onClick={()=>runDialogueMatch("analyze")} className="rounded-lg border border-white/8 px-2.5 py-1.5 text-[8px] text-white/40 disabled:opacity-25">{dialogueMatchBusy?"Measuring…":"Analyze match"}</button><button type="button" disabled={disabled || dialogueMatchBusy || !dialogueMatch?.plan || ((dialogueMatch.plan.warnings||[]).length>0 && !dialogueMatchOverride)} onClick={()=>runDialogueMatch("approve")} className="rounded-lg border border-[#d6a66a]/18 bg-[#d6a66a]/[0.05] px-2.5 py-1.5 text-[8px] text-[#efd29f]/60 disabled:opacity-25">Approve plan</button><button type="button" disabled={disabled || dialogueMatchBusy || !(dialogueMatch?.approval?.status==="APPROVED" || postEdit.dialogue_match_approved)} onClick={()=>runDialogueMatch("render")} className="rounded-lg border border-emerald-300/14 px-2.5 py-1.5 text-[8px] text-emerald-100/55 disabled:opacity-25">Render matched ADR</button></div></div>{dialogueMatchError?<div className="mt-2 text-[7px] text-red-100/55">{dialogueMatchError}</div>:null}{dialogueMatch?.plan?<div className="mt-3"><div className="grid grid-cols-2 gap-2 text-[7px] text-white/30 sm:grid-cols-4"><span>Gain {dialogueMatch.plan.gain_match_db>=0?"+":""}{dialogueMatch.plan.gain_match_db} dB</span><span>EQ moves {dialogueMatch.plan.eq_moves?.length||0}</span><span>{dialogueMatch.plan.production_perspective} → {dialogueMatch.plan.adr_perspective}</span><span>{dialogueMatch.plan.room_tone_required?"Room tone required":"Room tone optional"}</span></div><div className="mt-2 flex flex-wrap gap-1">{Object.entries(dialogueMatch.plan.band_deltas_db||{}).map(([band,value])=><span key={band} className="rounded-md border border-white/6 px-1.5 py-1 text-[7px] text-white/24">{band} {value>=0?"+":""}{value} dB</span>)}</div>{dialogueMatch.plan.warnings?.length?<label className="mt-2 flex items-center gap-2 text-[7px] text-amber-100/45"><input type="checkbox" checked={dialogueMatchOverride} onChange={e=>setDialogueMatchOverride(e.target.checked)} className="accent-[#d6a66a]"/> Engineer reviewed warnings: {dialogueMatch.plan.warnings.join(" · ")}</label>:null}{dialogueMatch.approval?.status==="APPROVED"||postEdit.dialogue_match_approved?<div className="mt-2 text-[7px] text-emerald-100/50">ADR match plan approved · fingerprint-bound</div>:null}{dialogueMatch?.matched_asset?.id?<div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-emerald-300/10 bg-emerald-300/[0.02] px-2.5 py-2"><div className="text-[7px] text-emerald-100/45">Matched ADR asset · {dialogueMatch.matched_asset.id}</div><button type="button" disabled={disabled} onClick={()=>updateDirect({...clip,source_asset_id:dialogueMatch.matched_asset.id,audio_post:normalizeAudioPostClipEditorial({...postEdit,dialogue_match_original_adr_asset_id:postEdit.dialogue_match_original_adr_asset_id||clip.source_asset_id,dialogue_match_rendered_asset_id:dialogueMatch.matched_asset.id,dialogue_match_approved:true,dialogue_match_plan_fingerprint:dialogueMatch.plan?.plan_fingerprint||postEdit.dialogue_match_plan_fingerprint},{frame_rate:frameRate,timeline_start_seconds:start}),preserve_source_asset:true,destructive_edit:false})} className="rounded-md border border-emerald-300/15 px-2 py-1 text-[7px] text-emerald-100/55">Use matched asset</button></div>:null}</div>:null}</div> : null}</div> : null}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" disabled={disabled || !playheadInside} onClick={trimLeft} className="rounded-lg border border-white/8 px-2 py-2 text-[9px] text-white/42 disabled:opacity-20">Trim left → {beatSnap ? "grid" : "playhead"}</button>
        <button type="button" disabled={disabled || !playheadInside} onClick={trimRight} className="rounded-lg border border-white/8 px-2 py-2 text-[9px] text-white/42 disabled:opacity-20">Trim right ← {beatSnap ? "grid" : "playhead"}</button>
        <button type="button" disabled={disabled || !playheadInside} onClick={split} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/8 px-2 py-2 text-[9px] text-white/42 disabled:opacity-20"><Scissors className="h-3 w-3" /> Split at {beatSnap ? "grid" : "playhead"}</button>
        <button type="button" disabled={disabled} onClick={duplicate} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/8 px-2 py-2 text-[9px] text-white/42 disabled:opacity-20"><Copy className="h-3 w-3" /> Duplicate after</button>
      </div>

      <div className="mt-3 flex items-start gap-2 text-[8px] leading-4 text-white/18"><MoveHorizontal className="mt-0.5 h-3 w-3 shrink-0" />Move changes timeline position only. Trim/split change source offsets and references; the original WAV asset is never rewritten. Beat snap quantizes edit positions only and never time-stretches the source.</div>
    </div>
  );
}
