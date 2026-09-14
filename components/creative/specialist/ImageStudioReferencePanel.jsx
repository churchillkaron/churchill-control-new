"use client";
import { useMemo } from "react";

const ROLES = ["IDENTITY_REFERENCE","PRODUCT_REFERENCE","BRAND_REFERENCE","COMPOSITION_REFERENCE","STYLE_REFERENCE","LOCATION_REFERENCE","SOURCE_IMAGE"];

export default function ImageStudioReferencePanel({ workspace, persistence, assets = [] }) {
  const byId = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
  const references = [...workspace.references].sort((a,b)=>Number(b.locked)-Number(a.locked)||Number(b.strength||0)-Number(a.strength||0));
  if (!references.length) return null;
  const update = async (reference, patch) => {
    const next = { ...reference, ...patch };
    workspace.updateReferenceLocal(next);
    const saved = await persistence.action("update_reference", next);
    workspace.updateReferenceLocal(saved);
  };
  return <section className="mt-5"><div className="text-[9px] font-semibold uppercase tracking-[.22em] text-white/28">References & moodboard</div>
    <div className="mt-2 space-y-2">{references.map((reference)=>{const asset=byId.get(reference.asset_id);return <div key={reference.id} className={`rounded-xl border p-3 ${reference.locked?"border-[#D6A66A]/25 bg-[#D6A66A]/[.035]":"border-white/[.06] bg-black/20"}`}>
      <div className="flex items-center justify-between gap-2"><div className="truncate text-[9px] font-medium text-white/55">{asset?.title||asset?.name||reference.asset_id}</div><span className={`text-[7px] uppercase tracking-[.12em] ${reference.locked?"text-[#D6A66A]":"text-white/25"}`}>{reference.locked?"Must follow":"Inspiration"}</span></div>
      <select value={reference.reference_role||"SOURCE_IMAGE"} onChange={(e)=>update(reference,{reference_role:e.target.value})} className="mt-2 w-full rounded border border-white/[.07] bg-black/40 px-2 py-1 text-[8px] text-white/55">{ROLES.map((role)=><option key={role} value={role}>{role.replaceAll("_"," ")}</option>)}</select>
      <div className="mt-2 flex items-center gap-2"><input aria-label="Reference strength" type="range" min="0" max="1" step="0.05" value={Number(reference.strength??1)} onChange={(e)=>workspace.updateReferenceLocal({...reference,strength:Number(e.target.value)})} onMouseUp={(e)=>update(reference,{strength:Number(e.currentTarget.value)})} className="min-w-0 flex-1"/><span className="w-7 text-right text-[8px] text-white/30">{Math.round(Number(reference.strength??1)*100)}%</span></div>
      <div className="mt-2 flex gap-2"><button type="button" onClick={()=>update(reference,{locked:!reference.locked})} className="rounded border border-white/[.07] px-2 py-1 text-[8px] text-white/40">{reference.locked?"Unlock":"Lock exact"}</button><input value={reference.notes||""} onChange={(e)=>workspace.updateReferenceLocal({...reference,notes:e.target.value})} onBlur={(e)=>update(reference,{notes:e.currentTarget.value})} placeholder="Reference notes" className="min-w-0 flex-1 rounded border border-white/[.07] bg-black/30 px-2 py-1 text-[8px] text-white/45 outline-none"/></div>
    </div>})}</div>
    <p className="mt-2 text-[8px] leading-4 text-white/22">Locked references are exact evidence. Unlocked references guide mood and direction only. Role boundaries prevent style references from becoming identity, product or brand truth.</p>
  </section>;
}
