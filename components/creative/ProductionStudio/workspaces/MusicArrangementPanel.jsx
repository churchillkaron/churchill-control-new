"use client";

import { useEffect, useState } from "react";
import { CopyPlus, LayoutGrid, Plus, Trash2 } from "lucide-react";

const TYPES = ["intro","verse","pre_chorus","chorus","post_chorus","bridge","breakdown","solo","outro","custom"];
function finite(value,fallback=0){const n=Number(value);return Number.isFinite(n)?n:fallback;}
function label(value){return String(value||"").replaceAll("_"," ").replace(/\b\w/g,(m)=>m.toUpperCase());}

export default function MusicArrangementPanel({organizationId,projectId}){
  const [arrangement,setArrangement]=useState(null);
  const [revision,setRevision]=useState(0);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [status,setStatus]=useState("");
  const [type,setType]=useState("verse");
  const [startBeat,setStartBeat]=useState(0);
  const [durationBeats,setDurationBeats]=useState(16);
  const [duplicationEvidence,setDuplicationEvidence]=useState(null);

  async function request(action,extra={}){
    if(!organizationId||!projectId||busy)return null;
    setBusy(true);setError("");setStatus("");
    try{
      const response=await fetch("/api/creative/music/arrangement",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,organization_id:organizationId,creative_project_id:projectId,...extra})});
      const body=await response.json();
      if(!response.ok||body.success===false)throw new Error(body.error||"Arrangement failed");
      setArrangement(body.arrangement||null);
      if(Number.isFinite(Number(body.revision)))setRevision(Number(body.revision));
      if(body.material_duplication){setDuplicationEvidence(body.material_duplication);setStatus("SECTION MATERIAL REPEATED");}
      return body;
    }catch(cause){setError(cause?.message||"Arrangement failed");return null;}
    finally{setBusy(false);}
  }

  useEffect(()=>{void request("load");},[organizationId,projectId]);
  const sections=arrangement?.sections||[];
  const totalBeats=Math.max(16,...sections.map((section)=>finite(section.end_beat,0)));

  async function update(section,patch){await request("update_section",{section_id:section.id,section:patch});}
  async function repeat(section){await request("repeat_section_material",{section_id:section.id,expected_revision:revision});}

  return <section className="mx-auto max-w-[1500px] p-6">
    <div className="mb-4"><div className="text-[9px] font-semibold uppercase tracking-[0.24em] text-[#d6a66a]/70">Song Arrangement</div><div className="mt-1 text-lg font-medium text-white/78">Structure the full performance</div><div className="mt-1 text-[10px] text-white/28">Sections can now repeat contained audio, MIDI and automation non-destructively. Source assets remain immutable.</div></div>
    <div className="rounded-2xl border border-white/8 bg-white/[0.018] p-4">
      <div className="flex flex-wrap items-end gap-2">
        <button type="button" disabled={busy} onClick={()=>void request("template",{template:{template:"standard",bars_per_section:8,beats_per_bar:4}})} className="rounded-lg border border-[#d6a66a]/20 bg-[#d6a66a]/[0.05] px-3 py-2 text-[8px] text-[#efd29f]/65 disabled:opacity-20">Build standard song</button>
        <button type="button" disabled={busy} onClick={()=>void request("template",{template:{template:"short",bars_per_section:8,beats_per_bar:4}})} className="rounded-lg border border-white/8 px-3 py-2 text-[8px] text-white/35 disabled:opacity-20">Build short song</button>
        <label className="ml-auto text-[7px] text-white/22"><div className="mb-1 uppercase">Section</div><select disabled={busy} value={type} onChange={e=>setType(e.target.value)} className="rounded-lg border border-white/8 bg-black/30 px-2 py-1.5 text-[8px] text-white/45">{TYPES.map(value=><option key={value} value={value}>{label(value)}</option>)}</select></label>
        <label className="text-[7px] text-white/22"><div className="mb-1 uppercase">Start beat</div><input disabled={busy} type="number" min="0" step="1" value={startBeat} onChange={e=>setStartBeat(Math.max(0,finite(e.target.value,0)))} className="w-20 rounded-lg border border-white/8 bg-black/30 px-2 py-1.5 text-[8px] text-white/45"/></label>
        <label className="text-[7px] text-white/22"><div className="mb-1 uppercase">Length</div><input disabled={busy} type="number" min="1" step="1" value={durationBeats} onChange={e=>setDurationBeats(Math.max(1,finite(e.target.value,16)))} className="w-20 rounded-lg border border-white/8 bg-black/30 px-2 py-1.5 text-[8px] text-white/45"/></label>
        <button type="button" disabled={busy} onClick={()=>void request("add_section",{section:{type,name:label(type),start_beat:startBeat,duration_beats:durationBeats}})} className="inline-flex items-center gap-1 rounded-lg border border-white/8 px-2.5 py-1.5 text-[8px] text-white/38 disabled:opacity-20"><Plus className="h-3 w-3"/> Add</button>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-white/7 bg-black/20 p-3">
        <div className="relative h-28 min-w-[900px] bg-[linear-gradient(to_right,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:6.25%_100%]">
          {sections.map((section)=>{const left=Math.max(0,finite(section.start_beat,0)/totalBeats*100);const width=Math.max(1,finite(section.duration_beats,1)/totalBeats*100);return <div key={section.id} className="absolute top-3 h-20 rounded-xl border border-[#d6a66a]/20 bg-[#d6a66a]/[0.06] px-2 py-2" style={{left:`${left}%`,width:`${width}%`}}><div className="truncate text-[8px] font-medium text-white/55">{section.name}</div><div className="mt-1 text-[6px] text-white/20">{finite(section.start_beat,0)}–{finite(section.end_beat,0)} beats</div><div className="mt-2 h-1 rounded bg-white/6"><div className="h-full rounded bg-[#d6a66a]/35" style={{width:`${Math.max(4,finite(section.intensity,.5)*100)}%`}}/></div></div>;})}
        </div>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {sections.map((section)=><div key={section.id} className="rounded-xl border border-white/7 bg-black/20 p-3">
          <div className="flex items-center justify-between"><div className="flex items-center gap-1.5 text-[8px] text-white/50"><LayoutGrid className="h-3 w-3"/>{section.name}{section.repeat_of_section_id?<span className="text-[6px] text-[#efd29f]/35">REPEAT</span>:null}</div><button type="button" disabled={busy} onClick={()=>void request("remove_section",{section_id:section.id})} className="rounded border border-white/7 p-1 text-white/22 disabled:opacity-20"><Trash2 className="h-2.5 w-2.5"/></button></div>
          <div className="mt-2 grid grid-cols-3 gap-1 text-[6px] text-white/18"><label>Start<input disabled={busy||section.locked} type="number" value={finite(section.start_beat,0)} onChange={e=>void update(section,{start_beat:Math.max(0,finite(e.target.value,0))})} className="mt-1 w-full rounded border border-white/7 bg-black/25 px-1 py-1 text-[7px] text-white/38"/></label><label>Length<input disabled={busy||section.locked} type="number" min=".25" value={finite(section.duration_beats,16)} onChange={e=>void update(section,{duration_beats:Math.max(.25,finite(e.target.value,16))})} className="mt-1 w-full rounded border border-white/7 bg-black/25 px-1 py-1 text-[7px] text-white/38"/></label><label>Intensity<input disabled={busy||section.locked} type="number" min="0" max="1" step=".05" value={finite(section.intensity,.5)} onChange={e=>void update(section,{intensity:Math.max(0,Math.min(1,finite(e.target.value,.5)))})} className="mt-1 w-full rounded border border-white/7 bg-black/25 px-1 py-1 text-[7px] text-white/38"/></label></div>
          <button type="button" disabled={busy||section.locked} onClick={()=>void repeat(section)} className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#d6a66a]/15 bg-[#d6a66a]/[0.035] px-2 py-1.5 text-[7px] text-[#efd29f]/55 disabled:opacity-20"><CopyPlus className="h-3 w-3"/> Repeat material at end</button>
        </div>)}
      </div>
      {duplicationEvidence?<div className="mt-3 rounded-xl border border-emerald-300/10 bg-emerald-300/[0.015] p-3 text-[7px] leading-4 text-emerald-100/40"><div>{status} · audio clips {duplicationEvidence.audio_clips_duplicated||0} · MIDI clips {duplicationEvidence.midi_clips_duplicated||0} · automation points {duplicationEvidence.automation_points_duplicated||0}</div><div className="mt-1 text-emerald-100/25">Boundary-crossing clips skipped: audio {duplicationEvidence.audio_boundary_clips_skipped||0}, MIDI {duplicationEvidence.midi_boundary_clips_skipped||0}. Originals preserved.</div></div>:null}
      {!sections.length?<div className="mt-4 text-[8px] text-white/24">No song sections yet. Build a template or add sections manually.</div>:null}
      {error?<div className="mt-3 rounded-lg border border-red-300/10 bg-red-400/[0.02] px-2 py-1.5 text-[7px] text-red-100/55">{error}</div>:null}
    </div>
  </section>;
}
