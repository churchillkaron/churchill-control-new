"use client";
import { useMemo } from "react";
import { AlertTriangle, BadgeCheck, Circle, ShieldAlert } from "lucide-react";
import { assessImageStudioComposition } from "@/lib/creative/stills/runtime/CreativeImageStudioQualityPreflightRuntime.js";

function readable(item) {
  return String(item || "").replace(/:[^:]+$/, "").replaceAll("_", " ").toLowerCase();
}

export default function ImageStudioQualityPanel({ workspace }) {
  const artboard = workspace.artboards.find((item) => item.id === workspace.selection.artboard_id) || workspace.artboards[0];
  const preflight = useMemo(() => assessImageStudioComposition({
    artboard,
    layers: workspace.layers.filter((layer) => layer.artboard_id === artboard?.id),
    comments: workspace.comments.filter((comment) => comment.artboard_id === artboard?.id),
  }), [artboard, workspace.layers, workspace.comments]);
  if (!artboard) return null;
  const checks = Object.entries(preflight.checks || {});
  return <section className="mt-5">
    <div className="flex items-center justify-between">
      <div><div className="text-[9px] font-semibold uppercase tracking-[.22em] text-[#948D84]">World-class preflight</div><div className="mt-1 text-[8px] text-[#AAA49C]">Release floor {preflight.release_threshold}/100</div></div>
      <div className={`text-[11px] font-semibold ${preflight.release_ready ? "text-[#607057]" : "text-[#D6A66A]"}`}>{preflight.score}/100</div>
    </div>
    <div className="mt-3 grid grid-cols-2 gap-1.5">
      {checks.map(([name, passed]) => <div key={name} className="flex items-center gap-1.5 rounded-md border border-[#E7E3DD] bg-[#FBFAF8] px-2 py-1.5 text-[7px] uppercase tracking-[.08em] text-[#817A72]">{passed ? <BadgeCheck className="h-3 w-3 text-[#607057]" /> : <ShieldAlert className="h-3 w-3 text-[#B36B52]" />}<span>{name.replaceAll("_", " ")}</span></div>)}
    </div>
    <div className="mt-2 space-y-1">
      {preflight.blockers.map((item)=><div key={item} className="flex items-center gap-2 rounded-md border border-[#B36B52]/20 bg-[#B36B52]/[0.05] px-2 py-1.5 text-[8px] text-[#8B4937]/80"><AlertTriangle className="h-3 w-3 shrink-0"/><span className="capitalize">{readable(item)}</span></div>)}
      {preflight.warnings.slice(0,6).map((item)=><div key={item} className="flex items-center gap-2 rounded-md border border-[#E7E3DD] px-2 py-1.5 text-[8px] text-[#8A837A]"><Circle className="h-2.5 w-2.5 shrink-0 text-[#D6A66A]/70"/><span className="capitalize">{readable(item)}</span></div>)}
      {!preflight.blockers.length&&!preflight.warnings.length?<div className="flex items-center gap-2 rounded-md border border-[#748267]/20 bg-[#748267]/[0.05] px-2 py-1.5 text-[8px] text-[#607057]"><BadgeCheck className="h-3 w-3"/>Professional release preflight is clean.</div>:null}
    </div>
  </section>;
}
