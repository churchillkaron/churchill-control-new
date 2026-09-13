"use client";
import { useMemo } from "react";
import { AlertTriangle, BadgeCheck, Circle } from "lucide-react";
import { assessImageStudioComposition } from "@/lib/creative/stills/runtime/CreativeImageStudioQualityPreflightRuntime.js";

export default function ImageStudioQualityPanel({ workspace }) {
  const artboard = workspace.artboards.find((item) => item.id === workspace.selection.artboard_id) || workspace.artboards[0];
  const preflight = useMemo(() => assessImageStudioComposition({
    artboard,
    layers: workspace.layers.filter((layer) => layer.artboard_id === artboard?.id),
    comments: workspace.comments.filter((comment) => comment.artboard_id === artboard?.id),
  }), [artboard, workspace.layers, workspace.comments]);
  if (!artboard) return null;
  return <section className="mt-5"><div className="flex items-center justify-between"><div className="text-[9px] font-semibold uppercase tracking-[.22em] text-white/28">Preflight</div><div className={`text-[10px] font-semibold ${preflight.release_ready ? "text-emerald-400" : "text-[#D6A66A]"}`}>{preflight.score}/100</div></div><div className="mt-2 space-y-1">{preflight.blockers.map((item)=><div key={item} className="flex items-center gap-2 rounded-md border border-red-400/15 bg-red-400/[.04] px-2 py-1.5 text-[8px] text-red-300/70"><AlertTriangle className="h-3 w-3"/>{item.replaceAll("_"," ")}</div>)}{preflight.warnings.slice(0,5).map((item)=><div key={item} className="flex items-center gap-2 rounded-md border border-white/[.05] px-2 py-1.5 text-[8px] text-white/35"><Circle className="h-2.5 w-2.5 text-[#D6A66A]/70"/>{item.replaceAll("_"," ")}</div>)}{!preflight.blockers.length&&!preflight.warnings.length?<div className="flex items-center gap-2 rounded-md border border-emerald-400/15 bg-emerald-400/[.04] px-2 py-1.5 text-[8px] text-emerald-300/70"><BadgeCheck className="h-3 w-3"/>Composition clears structural preflight.</div>:null}</div></section>;
}
