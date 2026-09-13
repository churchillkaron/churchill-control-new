"use client";

import {
  GitCompare,
  Hand,
  MessageSquare,
  MousePointer2,
  Scan,
  Type,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

const TOOLS = [
  ["select", MousePointer2],
  ["move", Hand],
  ["text", Type],
  ["comment", MessageSquare],
  ["region", Scan],
];

export default function ImageStudioCanvasToolbar({ workspace }) {
  return (
    <div className="mx-4 hidden items-center gap-1 rounded-lg border border-white/[0.07] bg-black/25 p-1 lg:flex">
      {TOOLS.map(([tool, Icon]) => (
        <button key={tool} type="button" title={tool} onClick={() => workspace.setTool(tool)}
          className={`rounded-md p-1.5 ${workspace.ui.tool === tool ? "bg-[#D6A66A]/10 text-[#D6A66A]" : "text-white/30 hover:text-white/55"}`}>
          <Icon className="h-3.5 w-3.5" />
        </button>
      ))}
      <span className="mx-1 h-4 w-px bg-white/[0.08]" />
      <button type="button" title="Zoom out"
        onClick={() => workspace.setViewport({ zoom: Math.max(0.2, workspace.viewport.zoom - 0.1) })}
        className="rounded-md p-1.5 text-white/30 hover:text-white/55">
        <ZoomOut className="h-3.5 w-3.5" />
      </button>
      <span className="min-w-10 text-center text-[9px] text-white/34">
        {Math.round(workspace.viewport.zoom * 100)}%
      </span>
      <button type="button" title="Zoom in"
        onClick={() => workspace.setViewport({ zoom: Math.min(3, workspace.viewport.zoom + 0.1) })}
        className="rounded-md p-1.5 text-white/30 hover:text-white/55">
        <ZoomIn className="h-3.5 w-3.5" />
      </button>
      <button type="button" title="Compare versions" onClick={workspace.toggleCompare}
        className={`rounded-md p-1.5 ${workspace.ui.compare ? "bg-[#D6A66A]/10 text-[#D6A66A]" : "text-white/30 hover:text-white/55"}`}>
        <GitCompare className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
