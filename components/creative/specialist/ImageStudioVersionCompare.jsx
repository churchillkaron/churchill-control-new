"use client";
import Image from "next/image";
import ImageStudioCanvasSurface from "./ImageStudioCanvasSurface";
import { imageStudioPreviewGeometry } from "@/lib/creative/stills/runtime/CreativeImageStudioImageGeometryRuntime.js";
import { measureImageStudioText } from "@/lib/creative/stills/runtime/CreativeImageStudioTypographyRuntime.js";

const n=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
function assetFor(id,assets){return assets.find((item)=>item.id===id)||null;}
function assetUrl(asset){return asset?.image_url||asset?.thumbnail_url||asset?.file_url||asset?.url||"";}
function sourceSize(asset,bounds){return{width:n(asset?.width||asset?.metadata?.width||asset?.technical?.width,n(bounds?.width,240)),height:n(asset?.height||asset?.metadata?.height||asset?.technical?.height,n(bounds?.height,180))};}

function Snapshot({ version, assets }) {
  const board=version?.snapshot?.artboard;
  const layers=Array.isArray(version?.snapshot?.layers)?version.snapshot.layers:[];
  if(!board)return <div className="flex min-h-[360px] items-center justify-center text-[10px] text-[#99928A]">No prior snapshot</div>;
  const scale=Math.min(.55,720/Math.max(n(board.width,1080),n(board.height,1350)));
  return <div className="flex min-h-[420px] items-center justify-center overflow-auto rounded-2xl border border-[#DDD8D0] bg-[#EEEAE4] p-8">
    <div className="relative shrink-0 overflow-hidden bg-white" style={{width:n(board.width,1080)*scale,height:n(board.height,1350)*scale}}>
      {layers.filter((layer)=>layer.visible!==false).sort((a,b)=>n(a.sort_order)-n(b.sort_order)).map((layer)=>{
        const b=layer.bounds||{}; const style={left:n(b.x)*scale,top:n(b.y)*scale,width:n(b.width,240)*scale,height:n(b.height,180)*scale,transform:`rotate(${n(layer.transform?.rotation)}deg)`,zIndex:10+n(layer.sort_order)};
        if(layer.layer_type==="TEXT"){const measured=measureImageStudioText({text:layer.content?.text||"Text",bounds:b,style:layer.style||{}});const justify=measured.verticalAlign==="middle"?"center":measured.verticalAlign==="bottom"?"flex-end":"flex-start";return <div key={layer.id} className="absolute flex overflow-hidden whitespace-pre" style={{...style,fontSize:measured.fontSize*scale,fontWeight:measured.weight,fontFamily:measured.family,color:layer.style?.color||"#111",lineHeight:measured.lineHeight,letterSpacing:measured.letterSpacing*scale,textAlign:measured.align,justifyContent:justify,flexDirection:"column"}}>{measured.visibleLines.join("\n")}</div>;}
        const asset=assetFor(layer.source_asset_id,assets); const url=assetUrl(asset); const preview=imageStudioPreviewGeometry(layer,sourceSize(asset,b),scale); return <div key={layer.id} className="absolute overflow-hidden" style={{...style,borderRadius:preview.frame.borderRadius}}>{url?<Image src={url} alt="" width={Math.max(1,Math.round(preview.image.width))} height={Math.max(1,Math.round(preview.image.height))} sizes="400px" style={{position:"absolute",left:preview.image.left,top:preview.image.top,width:preview.image.width,height:preview.image.height,maxWidth:"none"}}/>:null}</div>;
      })}
    </div>
  </div>;
}
export default function ImageStudioVersionCompare({ workspace, assets }) {
  const boardId=workspace.selection.artboard_id;
  const versions=workspace.versions.filter((item)=>item.artboard_id===boardId).sort((a,b)=>Number(b.version_number||0)-Number(a.version_number||0));
  const previous=versions.find((item)=>item.id===workspace.ui.compare_version_id)||versions[0]||null;
  return <div className="grid min-h-full gap-4 2xl:grid-cols-2">
    <div><div className="mb-2 text-[8px] font-semibold uppercase tracking-[.18em] text-[#99928A]">Current</div><ImageStudioCanvasSurface workspace={workspace} assets={assets}/></div>
    <div><div className="mb-2 flex items-center justify-between gap-2"><div className="text-[8px] font-semibold uppercase tracking-[.18em] text-[#99928A]">Snapshot {previous?.version_number?`v${previous.version_number}`:""}</div>{versions.length?<select value={previous?.id||""} onChange={e=>workspace.setCompareVersion(e.target.value)} className="rounded border border-[#DDD8D0] bg-[#FBFAF8] px-2 py-1 text-[8px] text-[#777169]">{versions.map(v=><option key={v.id} value={v.id}>v{v.version_number}</option>)}</select>:null}</div><Snapshot version={previous} assets={assets}/></div>
  </div>;
}
