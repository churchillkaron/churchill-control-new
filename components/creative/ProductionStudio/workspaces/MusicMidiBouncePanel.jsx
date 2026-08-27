"use client";

import { useEffect, useState } from "react";
import { AudioLines } from "lucide-react";
import { renderMusicMidiTrackToWav24 } from "@/lib/creative/music/client/MusicMidiBounceEngine";

export default function MusicMidiBouncePanel({ organizationId, projectId, session, disabled = false, onReload }) {
  const [sampler,setSampler]=useState(null);const [sampleUrls,setSampleUrls]=useState({});const [trackId,setTrackId]=useState("");const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [message,setMessage]=useState("");
  const tracks=session?.midi?.tracks||[];
  useEffect(()=>{if(!trackId&&tracks[0]?.id)setTrackId(tracks[0].id);},[trackId,tracks.length]);
  useEffect(()=>{let cancelled=false;async function load(){if(!organizationId||!projectId)return;try{const response=await fetch("/api/creative/music/sampler",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"load",organization_id:organizationId,creative_project_id:projectId})});const body=await response.json();if(!cancelled&&response.ok){setSampler(body.sampler||null);setSampleUrls(body.sample_urls||{});}}catch{}}void load();return()=>{cancelled=true;};},[organizationId,projectId]);

  async function bounce(){
    const track=tracks.find((entry)=>entry.id===trackId);if(!track||busy)return;setBusy(true);setError("");setMessage("");
    try{
      const rendered=await renderMusicMidiTrackToWav24({track,bpm:session.bpm,tempoMap:session.tempo_map,timeSignature:session.time_signature,sampler,sampleUrls,sampleRate:session.sample_rate||48000});
      const targetResponse=await fetch("/api/creative/music/midi-bounce",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"prepare_upload",organization_id:organizationId,creative_project_id:projectId,size_bytes:rendered.wav.blob.size})});
      const target=await targetResponse.json();if(!targetResponse.ok||target.success===false)throw new Error(target.error||"Bounce upload could not start");
      const upload=await fetch(target.upload_url,{method:"PUT",headers:{"Content-Type":"audio/wav"},body:rendered.wav.blob});if(!upload.ok)throw new Error(`Bounce upload failed (${upload.status})`);
      const registerResponse=await fetch("/api/creative/music/midi-bounce",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"register",organization_id:organizationId,creative_project_id:projectId,expected_revision:session.revision||0,midi_track_id:track.id,storage_reference:target.storage_reference,duration_seconds:rendered.duration_seconds,sample_rate:rendered.sample_rate,channels:rendered.channels,peak_dbfs:rendered.levels.peak_dbfs,rms_dbfs:rendered.levels.rms_dbfs,timeline_start_seconds:0,tempo_map_aware:rendered.tempo_map_aware===true,tempo_map_contract:rendered.tempo_map_contract,bounce_contract:rendered.contract,source_midi_core_fingerprint:rendered.source_midi_core_fingerprint,source_midi_fingerprint:rendered.source_midi_fingerprint})});
      const registered=await registerResponse.json();if(!registerResponse.ok||registered.success===false)throw new Error(registered.error||"Bounce could not register");
      setMessage(`${track.name} rendered to ${rendered.bit_depth}-bit WAV${rendered.tempo_map_aware?" with tempo-map timing":""}, source fingerprint locked, and added as an audio track.`);await onReload?.();
    }catch(cause){setError(cause?.message||"MIDI bounce failed");}finally{setBusy(false);}
  }

  return <div className="mt-4 rounded-2xl border border-white/8 bg-white/[0.018] p-4"><div className="flex flex-wrap items-end gap-3"><div><div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.2em] text-[#d6a66a]/65"><AudioLines className="h-3.5 w-3.5"/> MIDI → Audio Bounce</div><div className="mt-1 text-[8px] leading-4 text-white/24">Render an owned instrument or sampler performance offline to 24-bit WAV, preserve the MIDI source, honor the project tempo map, fingerprint the exact performance state, and add the bounce as a normal Workstation audio track. Editing that MIDI later makes the release bounce stale until re-rendered.</div></div><label className="ml-auto text-[7px] text-white/22"><div className="mb-1 uppercase">MIDI track</div><select disabled={disabled||busy} value={trackId} onChange={(e)=>setTrackId(e.target.value)} className="min-w-44 rounded-lg border border-white/8 bg-black/30 px-2 py-1.5 text-[8px] text-white/45">{tracks.map((track)=><option key={track.id} value={track.id}>{track.name}</option>)}</select></label><button type="button" disabled={disabled||busy||!trackId} onClick={()=>void bounce()} className="rounded-lg border border-[#d6a66a]/20 bg-[#d6a66a]/[0.05] px-3 py-2 text-[8px] text-[#efd29f]/65 disabled:opacity-20">{busy?"Rendering…":"Bounce to 24-bit Audio"}</button></div>{message?<div className="mt-2 text-[7px] text-emerald-100/45">{message}</div>:null}{error?<div className="mt-2 rounded-lg border border-red-300/10 bg-red-400/[0.02] px-2 py-1.5 text-[7px] text-red-100/55">{error}</div>:null}</div>;
}
