import { createHash } from "node:crypto";

function text(value){return String(value??"").trim();}
function finite(value,fallback=0){const number=Number(value);return Number.isFinite(number)?number:fallback;}
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==="object")return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));return value;}

export function musicTrackEvidenceInput(track={}){
  const clips=(track.clips||[]).filter(clip=>clip?.muted!==true&&text(clip?.source_asset_id)).map(clip=>({
    id:text(clip.id)||null,
    source_asset_id:text(clip.source_asset_id),
    source_version:Math.max(0,Math.round(finite(clip.source_version,0))),
    start_seconds:finite(clip.start_seconds,0),
    duration_seconds:Math.max(0,finite(clip.duration_seconds,0)),
    source_offset_seconds:Math.max(0,finite(clip.source_offset_seconds,0)),
    gain_db:finite(clip.gain_db,0),
    fade_in_seconds:Math.max(0,finite(clip.fade_in_seconds,0)),
    fade_out_seconds:Math.max(0,finite(clip.fade_out_seconds,0)),
    loop_enabled:clip.loop_enabled===true,
    loop_length_seconds:clip.loop_enabled===true?Math.max(0,finite(clip.loop_length_seconds,0)):null,
    reversed:clip.reversed===true,
    warp_mode:text(clip.warp_mode||"off")||"off",
  })).sort((a,b)=>a.start_seconds-b.start_seconds||String(a.id).localeCompare(String(b.id)));
  return canonical({
    contract:"AVANTIQO_MUSIC_TRACK_EVIDENCE_INPUT_V1",
    track_id:text(track.id),
    source_cleanup:track.source_cleanup||{},
    clips,
  });
}

export function musicTrackEvidenceInputFingerprint(track={}){
  return createHash("sha256").update(JSON.stringify(musicTrackEvidenceInput(track))).digest("hex");
}

export const CreativeMusicEvidenceLineageRuntime=Object.freeze({input:musicTrackEvidenceInput,fingerprint:musicTrackEvidenceInputFingerprint});
