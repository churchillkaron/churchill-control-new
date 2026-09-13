"use client";
import { useState } from "react";

export default function ImageStudioExportPanel({workspace}) {
  const [format,setFormat]=useState("PNG");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState(null);
  const board=workspace.artboards.find(x=>x.id===workspace.selection.artboard_id);
  const exportMaster=async()=>{setBusy(true);setError(null);try{
    const response=await fetch("/api/workspace/creative/image-studio/export",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({organization_id:workspace.organization_id,project_id:workspace.project_id,artboard_id:board.id,format})});
    if(!response.ok){const body=await response.json().catch(()=>({}));const details=body.preflight?.blockers?.concat(body.preflight?.warnings||[]).slice(0,3).join(" · ");setError(details||body.error||"Export blocked");return;}
    const blob=await response.blob();const url=URL.createObjectURL(blob);const anchor=document.createElement("a");anchor.href=url;anchor.download=`${board.name||"image-studio"}.${format==="JPEG"?"jpg":format.toLowerCase()}`;anchor.click();URL.revokeObjectURL(url);
  } finally {setBusy(false);}};
  return <section className="mt-5"><div className="text-[9px] font-semibold uppercase tracking-[.22em] text-white/28">Output</div><div className="mt-2 flex gap-2"><select value={format} onChange={e=>setFormat(e.target.value)} className="rounded-md border border-white/[.07] bg-black/30 px-2 py-1.5 text-[9px] text-white/55"><option>PNG</option><option>JPEG</option><option>PDF</option></select><button disabled={busy||!board} onClick={exportMaster} className="rounded-md border border-[#D6A66A]/20 bg-[#D6A66A]/[.06] px-3 py-1.5 text-[9px] text-[#D6A66A] disabled:opacity-30">{busy?"Rendering…":`Export ${format}`}</button></div>{error?<div className="mt-2 rounded-md border border-red-400/20 bg-red-400/[.05] px-2 py-2 text-[8px] leading-4 text-red-300">Export blocked · {error}</div>:null}</section>;
}
