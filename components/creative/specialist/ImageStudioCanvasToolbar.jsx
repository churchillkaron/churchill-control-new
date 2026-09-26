"use client";

import {
  Camera,
  GitCompare,
  Grid3X3,
  Hand,
  Loader2,
  MessageSquare,
  MousePointer2,
  Save,
  Scan,
  Type,
  ZoomIn,
  ZoomOut,
  Plus,
  Maximize2,
  Undo2,
  Redo2,
  Group,
  Ungroup,
  Scissors,
  SlidersHorizontal,
} from "lucide-react";

const TOOLS = [
  ["select", MousePointer2],
  ["move", Hand],
  ["text", Type],
  ["comment", MessageSquare],
  ["region", Scan],
];

export default function ImageStudioCanvasToolbar({ workspace, persistence }) {
  const busy = persistence?.status === "SAVING" || persistence?.status === "LOADING";
  return (
    <div className="mx-4 hidden items-center gap-1 rounded-lg border border-[#DDD8D0] bg-[#FBFAF8] p-1 lg:flex">
      {TOOLS.map(([tool, Icon]) => (
        <button key={tool} type="button" title={tool} onClick={() => workspace.setTool(tool)}
          className={`rounded-md p-1.5 ${workspace.ui.tool === tool ? "bg-[#D6A66A]/10 text-[#D6A66A]" : "text-[#918B83] hover:text-[#665F57]"}`}>
          <Icon className="h-3.5 w-3.5" />
        </button>
      ))}
      <span className="mx-1 h-4 w-px bg-[#DED9D1]" />
      <button type="button" title="Undo" disabled={!workspace.historyPast?.length} onClick={workspace.undo} className="rounded-md p-1.5 text-[#918B83] hover:text-[#665F57] disabled:cursor-not-allowed disabled:opacity-20"><Undo2 className="h-3.5 w-3.5" /></button>
      <button type="button" title="Redo" disabled={!workspace.historyFuture?.length} onClick={workspace.redo} className="rounded-md p-1.5 text-[#918B83] hover:text-[#665F57] disabled:cursor-not-allowed disabled:opacity-20"><Redo2 className="h-3.5 w-3.5" /></button>
      <button type="button" title="Group selection" disabled={(workspace.selection.layer_ids?.length || 0) < 2} onClick={workspace.groupSelected} className="rounded-md p-1.5 text-[#918B83] hover:text-[#D6A66A] disabled:cursor-not-allowed disabled:opacity-20"><Group className="h-3.5 w-3.5" /></button>
      <button type="button" title="Ungroup selection" disabled={!workspace.layers.some((layer) => workspace.selection.layer_ids?.includes(layer.id) && layer.parent_layer_id)} onClick={workspace.ungroupSelected} className="rounded-md p-1.5 text-[#918B83] hover:text-[#D6A66A] disabled:cursor-not-allowed disabled:opacity-20"><Ungroup className="h-3.5 w-3.5" /></button>
      <button type="button" title="Create clipping mask from two selected layers" disabled={(workspace.selection.layer_ids?.length || 0) !== 2} onClick={workspace.createClippingMask} className="rounded-md p-1.5 text-[#918B83] hover:text-[#D6A66A] disabled:cursor-not-allowed disabled:opacity-20"><Scissors className="h-3.5 w-3.5" /></button>
      <button type="button" title="Release clipping mask" disabled={!workspace.layers.some((layer) => workspace.selection.layer_ids?.includes(layer.id) && (layer.metadata?.clip_mask_layer_id || layer.layer_type==="MASK"))} onClick={workspace.releaseClippingMask} className="rounded-md px-1.5 py-1 text-[8px] text-[#918B83] hover:text-[#D6A66A] disabled:cursor-not-allowed disabled:opacity-20">Unmask</button>
      <button type="button" title="Create adjustment layer for selected image layers" disabled={!workspace.layers.some((layer)=>workspace.selection.layer_ids?.includes(layer.id)&&layer.layer_type==="IMAGE")} onClick={workspace.createAdjustmentLayerFromSelected} className="rounded-md p-1.5 text-[#918B83] hover:text-[#D6A66A] disabled:cursor-not-allowed disabled:opacity-20"><SlidersHorizontal className="h-3.5 w-3.5" /></button>
      <button type="button" title="Create mask layer from Region" disabled={!workspace.ui.region||!workspace.layers.some((layer)=>workspace.selection.layer_ids?.includes(layer.id)&&layer.layer_type==="IMAGE")} onClick={()=>workspace.createMaskLayerFromRegion("RECT")} className="rounded-md px-1.5 py-1 text-[8px] text-[#918B83] hover:text-[#D6A66A] disabled:cursor-not-allowed disabled:opacity-20">Mask</button>
      <span className="mx-1 h-4 w-px bg-[#DED9D1]" />
      <button type="button" title="Add text" onClick={() => { const artboardId=workspace.selection.artboard_id; if(!artboardId)return; workspace.addLayerLocal({ id: crypto.randomUUID(), artboard_id: artboardId, parent_layer_id:null, source_asset_id:null, layer_type:"TEXT", name:"Text", bounds:{x:80,y:80,width:420,height:100}, transform:{rotation:0}, style:{font_asset_id:"platform-font:inter",font_family:"Inter",font_source:"AVANTIQO_FONT_LIBRARY",font_size:52,font_weight:600,color:"#111111",line_height:1.05,letter_spacing:0,text_align:"left",vertical_align:"top"}, content:{text:"New text"}, sort_order:workspace.layers.length+1, visible:true, locked:false, metadata:{} }); }} className="rounded-md p-1.5 text-[#918B83] hover:text-[#D6A66A]">
        <Plus className="h-3.5 w-3.5" />
      </button>
      <button type="button" title="Fit to view" onClick={() => workspace.requestFitToView?.()} className="rounded-md px-1.5 py-1 text-[9px] text-[#918B83] hover:text-[#665F57]">Fit</button>
      <button type="button" title="Actual size" onClick={() => workspace.setViewport({ zoom: 1 })} className="rounded-md p-1.5 text-[#918B83] hover:text-[#665F57]"><Maximize2 className="h-3.5 w-3.5" /></button>
      <button type="button" title="Zoom out"
        onClick={() => workspace.setViewport({ zoom: Math.max(0.2, workspace.viewport.zoom - 0.1) })}
        className="rounded-md p-1.5 text-[#918B83] hover:text-[#665F57]">
        <ZoomOut className="h-3.5 w-3.5" />
      </button>
      <span className="min-w-10 text-center text-[9px] text-[#8A837A]">
        {Math.round(workspace.viewport.zoom * 100)}%
      </span>
      <button type="button" title="Zoom in"
        onClick={() => workspace.setViewport({ zoom: Math.min(3, workspace.viewport.zoom + 0.1) })}
        className="rounded-md p-1.5 text-[#918B83] hover:text-[#665F57]">
        <ZoomIn className="h-3.5 w-3.5" />
      </button>
      <button type="button" title="Compare versions" onClick={workspace.toggleCompare}
        className={`rounded-md p-1.5 ${workspace.ui.compare ? "bg-[#D6A66A]/10 text-[#D6A66A]" : "text-[#918B83] hover:text-[#665F57]"}`}>
        <GitCompare className="h-3.5 w-3.5" />
      </button>
      <button type="button" title="Toggle grid and safe zone" onClick={workspace.toggleGrid}
        className={`rounded-md p-1.5 ${workspace.ui.grid ? "bg-[#D6A66A]/10 text-[#D6A66A]" : "text-[#918B83] hover:text-[#665F57]"}`}>
        <Grid3X3 className="h-3.5 w-3.5" />
      </button>
      <span className="mx-1 h-4 w-px bg-[#DED9D1]" />
      <button type="button" title="Save artboard" disabled={busy}
        onClick={() => persistence?.saveSelectedArtboard?.()}
        className="rounded-md p-1.5 text-[#918B83] hover:text-[#D6A66A] disabled:opacity-30">
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
      </button>
      <button type="button" title="Snapshot version" disabled={busy}
        onClick={() => persistence?.snapshotSelectedArtboard?.()}
        className="rounded-md p-1.5 text-[#918B83] hover:text-[#D6A66A] disabled:opacity-30">
        <Camera className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
