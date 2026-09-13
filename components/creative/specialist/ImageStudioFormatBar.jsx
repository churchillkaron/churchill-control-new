"use client";
import { CopyPlus, Grid3X3, AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter } from "lucide-react";
import { IMAGE_STUDIO_FORMAT_PRESETS } from "@/lib/creative/stills/runtime/CreativeImageStudioDesignRuntime.js";

export default function ImageStudioFormatBar({ workspace }) {
  const board = workspace.artboards.find((item) => item.id === workspace.selection.artboard_id) || workspace.artboards[0];
  if (!board) return null;
  const duplicate = (preset) => workspace.duplicateArtboardLocal(board.id, preset);
  return <div className="flex flex-wrap items-center gap-1 border-b border-white/[0.06] bg-[#080807] px-4 py-2">
    <div className="mr-2 text-[8px] font-semibold uppercase tracking-[0.18em] text-white/24">Formats</div>
    {IMAGE_STUDIO_FORMAT_PRESETS.slice(0,5).map((preset)=><button key={preset.id} onClick={()=>duplicate(preset)} className="rounded-md border border-white/[0.06] px-2 py-1 text-[8px] text-white/34 hover:border-[#D6A66A]/30 hover:text-[#D6A66A]" title={`Duplicate as ${preset.label}`}><CopyPlus className="mr-1 inline h-3 w-3"/>{preset.label}</button>)}
    <span className="mx-1 h-4 w-px bg-white/[0.08]" />
    <button onClick={()=>workspace.toggleGrid()} className={`rounded-md p-1.5 ${workspace.ui.grid ? "text-[#D6A66A]" : "text-white/30"}`} title="Grid"><Grid3X3 className="h-3.5 w-3.5"/></button>
    <button onClick={()=>workspace.distributeSelected("x")} className="rounded-md p-1.5 text-white/30 hover:text-[#D6A66A]" title="Distribute horizontally"><AlignHorizontalDistributeCenter className="h-3.5 w-3.5"/></button>
    <button onClick={()=>workspace.distributeSelected("y")} className="rounded-md p-1.5 text-white/30 hover:text-[#D6A66A]" title="Distribute vertically"><AlignVerticalDistributeCenter className="h-3.5 w-3.5"/></button>
  </div>;
}
