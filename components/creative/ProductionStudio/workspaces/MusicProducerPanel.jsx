"use client";

import { useEffect, useState } from "react";
import { RotateCcw, Sparkles, WandSparkles } from "lucide-react";

const SEVERITY_CLASS = {
  HIGH: "border-red-300/10 text-red-100/55",
  MEDIUM: "border-amber-300/10 text-amber-100/50",
  LOW: "border-white/7 text-white/30",
};

export default function MusicProducerPanel({ organizationId, projectId }) {
  const [plan,setPlan]=useState(null);
  const [revision,setRevision]=useState(0);
  const [undoAvailable,setUndoAvailable]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [status,setStatus]=useState("");

  async function request(action,extra={}){
    if(!organizationId||!projectId||busy)return null;
    setBusy(true);setError("");setStatus("");
    try{
      const response=await fetch("/api/creative/music/producer",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,organization_id:organizationId,creative_project_id:projectId,expected_revision:revision,...extra})});
      const body=await response.json();
      if(!response.ok||body.success===false)throw new Error(body.error||"Music Producer failed");
      if(body.plan)setPlan(body.plan);
      if(Number.isFinite(Number(body.revision)))setRevision(Number(body.revision));
      if(typeof body.undo_available==="boolean")setUndoAvailable(body.undo_available);
      else if(body.snapshot_id)setUndoAvailable(true);
      setStatus(action==="analyze"?"PROJECT ANALYZED":action==="undo"?"LAST PRODUCER CHANGE UNDONE":"PROJECT UPDATED · REVERSIBLE SNAPSHOT SAVED");
      if(action!=="analyze"&&action!=="undo"){
        const refresh=await fetch("/api/creative/music/producer",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"analyze",organization_id:organizationId,creative_project_id:projectId})});
        const refreshed=await refresh.json();
        if(refresh.ok&&refreshed.success!==false){setPlan(refreshed.plan||null);setRevision(Number(refreshed.revision)||0);setUndoAvailable(refreshed.undo_available===true);}
      } else if(action==="undo") {
        const refresh=await fetch("/api/creative/music/producer",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"analyze",organization_id:organizationId,creative_project_id:projectId})});
        const refreshed=await refresh.json();
        if(refresh.ok&&refreshed.success!==false){setPlan(refreshed.plan||null);setRevision(Number(refreshed.revision)||0);setUndoAvailable(refreshed.undo_available===true);}
      }
      return body;
    }catch(cause){setError(cause?.message||"Music Producer failed");return null;}
    finally{setBusy(false);}
  }

  useEffect(()=>{void request("analyze");},[organizationId,projectId]);

  if(!projectId)return <div className="p-8 text-sm text-white/42">Open or create a Music project before using Producer.</div>;

  return <section className="mx-auto max-w-7xl p-6">
    <div className="overflow-hidden rounded-3xl border border-[#d6a66a]/20 bg-gradient-to-b from-[#d6a66a]/[0.05] to-black/30">
      <div className="border-b border-white/7 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.24em] text-[#d6a66a]/75"><Sparkles className="h-3.5 w-3.5"/> Music Producer</div><div className="mt-2 text-xl font-medium text-white/80">Project-aware production decisions</div><div className="mt-1 max-w-2xl text-[10px] leading-5 text-white/30">This layer reads the real Music project and applies reversible structure/MIDI changes. It is the governed action layer for the future owned Intelligence; this baseline does not falsely claim model inference.</div></div>
          <div className="flex gap-2"><button type="button" disabled={busy} onClick={()=>void request("analyze")} className="inline-flex items-center gap-1.5 rounded-xl border border-white/8 px-3 py-2 text-[9px] text-white/40 disabled:opacity-20"><WandSparkles className="h-3.5 w-3.5"/> Analyze</button><button type="button" disabled={busy||!undoAvailable} onClick={()=>void request("undo")} className="inline-flex items-center gap-1.5 rounded-xl border border-white/8 px-3 py-2 text-[9px] text-white/40 disabled:opacity-20"><RotateCcw className="h-3.5 w-3.5"/> Undo Producer</button></div>
        </div>
      </div>

      <div className="grid gap-4 p-6 lg:grid-cols-[1fr_340px]">
        <div>
          <div className="text-[8px] font-semibold uppercase tracking-[0.18em] text-white/25">Production findings</div>
          <div className="mt-3 space-y-2">{(plan?.issues||[]).map((issue)=><div key={issue.code} className={`rounded-xl border bg-black/20 p-3 ${SEVERITY_CLASS[issue.severity]||SEVERITY_CLASS.LOW}`}><div className="flex items-center justify-between gap-2"><span className="text-[8px] font-medium">{issue.message}</span><span className="text-[6px] opacity-60">{issue.severity}</span></div><div className="mt-1 text-[6px] opacity-40">{issue.code}</div></div>)}{plan&&!plan.issues?.length?<div className="rounded-xl border border-emerald-300/10 bg-emerald-300/[0.015] p-3 text-[8px] text-emerald-100/45">No structural foundation gaps detected by the current Producer baseline.</div>:null}</div>

          <div className="mt-5 text-[8px] font-semibold uppercase tracking-[0.18em] text-white/25">Recommended project actions</div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">{(plan?.proposals||[]).map((proposal)=><button key={proposal.id} type="button" disabled={busy} onClick={()=>void request(String(proposal.action||"").toLowerCase())} className="rounded-xl border border-[#d6a66a]/15 bg-[#d6a66a]/[0.025] p-3 text-left disabled:opacity-20"><div className="text-[9px] text-[#efd29f]/60">{proposal.label}</div><div className="mt-1 text-[7px] text-white/20">Reversible · snapshot before apply</div></button>)}</div>

          <button type="button" disabled={busy} onClick={()=>void request("build_foundations")} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-[#d6a66a]/25 bg-[#d6a66a]/[0.07] px-4 py-2.5 text-[9px] text-[#efd29f]/75 disabled:opacity-20"><Sparkles className="h-3.5 w-3.5"/> Build missing foundations</button>
        </div>

        <aside className="rounded-2xl border border-white/7 bg-black/20 p-4">
          <div className="text-[8px] font-semibold uppercase tracking-[0.18em] text-white/25">Current project</div>
          <div className="mt-3 grid grid-cols-2 gap-2">{[
            ["Audio tracks",plan?.project_state?.audio_track_count],["Audio clips",plan?.project_state?.audio_clip_count],
            ["MIDI tracks",plan?.project_state?.midi_track_count],["MIDI notes",plan?.project_state?.midi_note_count],
            ["Sections",plan?.project_state?.arrangement_section_count],["Samples",plan?.project_state?.assigned_sampler_asset_count],
          ].map(([name,value])=><div key={name} className="rounded-xl border border-white/6 bg-white/[0.01] p-2"><div className="text-[6px] uppercase text-white/16">{name}</div><div className="mt-1 text-sm text-white/55">{value??0}</div></div>)}</div>
          <div className="mt-3 text-[7px] leading-4 text-white/18">Revision {revision} · {plan?.project_state?.bpm||0} BPM · {plan?.project_state?.time_signature||"4/4"}</div>
          <div className="mt-3 rounded-xl border border-white/6 p-2 text-[7px] leading-4 text-white/20">Automatic audio rendering is forbidden here. Provider jobs: none. Source assets remain preserved.</div>
        </aside>
      </div>
      {status?<div className="border-t border-emerald-300/8 px-6 py-3 text-[8px] text-emerald-100/45">{status}</div>:null}
      {error?<div className="border-t border-red-300/8 px-6 py-3 text-[8px] text-red-100/55">{error}</div>:null}
    </div>
  </section>;
}
