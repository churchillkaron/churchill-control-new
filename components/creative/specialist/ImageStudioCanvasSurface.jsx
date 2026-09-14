"use client";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildSafeZone,
  clampImageStudioZoom,
  fitImageStudioZoom,
  resizeBoundsFromHandle,
  rotateLayersAroundSelection,
  scaleLayersFromSelection,
  selectionBounds,
  snapLayerBounds,
  snapResizeBounds,
  snapRotation,
} from "@/lib/creative/stills/runtime/CreativeImageStudioDesignRuntime.js";
import { imageStudioPreviewGeometry } from "@/lib/creative/stills/runtime/CreativeImageStudioImageGeometryRuntime.js";
import { measureImageStudioText } from "@/lib/creative/stills/runtime/CreativeImageStudioTypographyRuntime.js";
import { imageStudioPreviewEffectStyle } from "@/lib/creative/stills/runtime/CreativeImageStudioEffectsRuntime.js";
import { useImageStudioFonts } from "./useImageStudioFonts";

const n=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const HANDLES=[
 ["nw","-top-1.5 -left-1.5","nwse-resize"],["n","-top-1.5 left-1/2 -translate-x-1/2","ns-resize"],["ne","-top-1.5 -right-1.5","nesw-resize"],
 ["e","top-1/2 -right-1.5 -translate-y-1/2","ew-resize"],["se","-bottom-1.5 -right-1.5","nwse-resize"],["s","-bottom-1.5 left-1/2 -translate-x-1/2","ns-resize"],
 ["sw","-bottom-1.5 -left-1.5","nesw-resize"],["w","top-1/2 -left-1.5 -translate-y-1/2","ew-resize"],
];
function rect(layer){const b=layer.bounds||{};return{x:n(b.x),y:n(b.y),width:Math.max(24,n(b.width,240)),height:Math.max(24,n(b.height,180))};}
function assetFor(layer,assets){return assets.find(x=>x.id===layer.source_asset_id)||null;}
function urlFor(asset){return asset?.image_url||asset?.thumbnail_url||asset?.file_url||asset?.url||"";}
function sourceSize(asset,fallback){return{width:n(asset?.width||asset?.metadata?.width||asset?.technical?.width,fallback.width),height:n(asset?.height||asset?.metadata?.height||asset?.technical?.height,fallback.height)};}
function center(box){return{x:box.x+box.width/2,y:box.y+box.height/2};}
function rotationFromPointer(point,box){const c=center(box);return Math.atan2(point.y-c.y,point.x-c.x)*180/Math.PI+90;}

function TransformHandles({onHandle, onRotate, multi=false}) {
 return <>
  {HANDLES.map(([handle,position,cursor])=><button key={handle} aria-label={`Resize layer ${handle}`} className={`absolute z-[90] h-3 w-3 rounded-[2px] border border-[#74695E] bg-white shadow-sm ${position}`} style={{cursor}} onPointerDown={e=>onHandle(e,handle)}/>) }
  <div className="pointer-events-none absolute left-1/2 top-[-26px] h-[20px] w-px -translate-x-1/2 bg-[#D6A66A]/75"/>
  <button aria-label={multi?"Rotate selection":"Rotate layer"} title={multi?"Rotate selection":"Rotate layer"} className="absolute left-1/2 top-[-36px] z-[95] h-4 w-4 -translate-x-1/2 rounded-full border border-[#74695E] bg-white shadow-sm" style={{cursor:"grab"}} onPointerDown={onRotate}/>
 </>;
}

export default function ImageStudioCanvasSurface({workspace,assets=[]}){
 const fonts=useImageStudioFonts(workspace);
 const board=workspace.artboards.find(x=>x.id===workspace.selection.artboard_id)||workspace.artboards[0];
 const layers=useMemo(()=>workspace.layers.filter(x=>x.artboard_id===board?.id).sort((a,b)=>a.sort_order-b.sort_order),[workspace.layers,board?.id]);
 const selectedLayers=useMemo(()=>layers.filter(layer=>workspace.selection.layer_ids.includes(layer.id)),[layers,workspace.selection.layer_ids]);
 const shell=useRef(null); const workspaceCanvasRef=useRef(null); const drag=useRef(null); const [guide,setGuide]=useState(null); const [regionDraft,setRegionDraft]=useState(null);
 useEffect(()=>{if(!board||!workspace.ui.fit_request||!shell.current)return;const box=shell.current.getBoundingClientRect();workspace.setViewport({zoom:fitImageStudioZoom(board,{width:box.width,height:box.height})});},[workspace.ui.fit_request,board?.id,board?.width,board?.height]);
 if(!board)return <div className="flex min-h-[420px] items-center justify-center text-xs text-[#918B83]">Create or save an artboard to start composing.</div>;
 const scale=clampImageStudioZoom(workspace.viewport.zoom); const w=board.width*scale,h=board.height*scale; const safe=buildSafeZone(board);
 const selectedBox=selectionBounds(selectedLayers);
 const beginMove=(e,layer)=>{if(layer.locked)return;e.stopPropagation();const additive=e.shiftKey||e.metaKey||e.ctrlKey;const already=workspace.selection.layer_ids.includes(layer.id);if(additive){workspace.toggleLayerSelection(layer.id);return;}workspace.beginHistoryTransaction();if(!already)workspace.selectLayers([layer.id]);const ids=already?workspace.selection.layer_ids:[layer.id];const movable=layers.filter(item=>ids.includes(item.id)&&!item.locked);const origins=new Map(movable.map(item=>[item.id,rect(item)]));drag.current={mode:"move",startX:e.clientX,startY:e.clientY,origins,primary:rect(layer)};e.currentTarget.setPointerCapture?.(e.pointerId);};
 const beginTransform=(e,mode,handle=null)=>{if(!selectedLayers.length)return;e.stopPropagation();workspace.beginHistoryTransaction();const unlocked=selectedLayers.filter(layer=>!layer.locked);const box=selectionBounds(unlocked);if(!box)return;const canvas=workspaceCanvasRef.current?.getBoundingClientRect();const pointer=canvas?{x:(e.clientX-canvas.left)/scale,y:(e.clientY-canvas.top)/scale}:{x:box.x+box.width/2,y:box.y-24};drag.current={mode,handle,startX:e.clientX,startY:e.clientY,selection:box,origins:unlocked.map(layer=>({...layer,bounds:{...rect(layer)},transform:{...(layer.transform||{})}})),startRotation:rotationFromPointer(pointer,box)};e.currentTarget.setPointerCapture?.(e.pointerId);};
 const move=(e)=>{const d=drag.current;if(!d)return;const dx=(e.clientX-d.startX)/scale,dy=(e.clientY-d.startY)/scale;
  if(d.mode==="move") { const primaryOrigin=d.primary;let next={...primaryOrigin,x:clamp(primaryOrigin.x+dx,0,board.width-primaryOrigin.width),y:clamp(primaryOrigin.y+dy,0,board.height-primaryOrigin.height)};const siblings=layers.filter(layer=>!d.origins.has(layer.id)&&layer.visible!==false);const snapped=snapLayerBounds(next,board,siblings,{threshold:8/Math.max(scale,.25)});next.x=clamp(snapped.bounds.x,0,board.width-primaryOrigin.width);next.y=clamp(snapped.bounds.y,0,board.height-primaryOrigin.height);setGuide(snapped.guides);const appliedDx=next.x-primaryOrigin.x,appliedDy=next.y-primaryOrigin.y;for(const [id,origin] of d.origins){workspace.updateLayerLocal(id,{bounds:{...origin,x:clamp(origin.x+appliedDx,0,board.width-origin.width),y:clamp(origin.y+appliedDy,0,board.height-origin.height)}});}return; }
  if(d.mode==="resize") { const preserveAspect=e.shiftKey;let next=resizeBoundsFromHandle(d.selection,d.handle,dx,dy,{preserveAspect,aspectRatio:d.selection.width/d.selection.height,minSize:24});const siblings=layers.filter(layer=>!d.origins.some(origin=>origin.id===layer.id)&&layer.visible!==false);if(d.handle.includes("e")||d.handle.includes("s")){const snapped=snapResizeBounds(next,board,siblings,{threshold:8/Math.max(scale,.25),preserveAspect,aspectRatio:d.selection.width/d.selection.height,minSize:24});next={...next,width:snapped.bounds.width,height:snapped.bounds.height};setGuide(snapped.guides);}next={...next,x:clamp(next.x,0,board.width-24),y:clamp(next.y,0,board.height-24),width:Math.min(next.width,board.width-clamp(next.x,0,board.width-24)),height:Math.min(next.height,board.height-clamp(next.y,0,board.height-24))};const scaled=scaleLayersFromSelection(d.origins,d.selection,next);for(const layer of scaled)workspace.updateLayerLocal(layer.id,{bounds:layer.bounds});return; }
  if(d.mode==="rotate") { const canvasBox=workspaceCanvasRef.current?.getBoundingClientRect();if(!canvasBox)return;const p={x:(e.clientX-canvasBox.left)/scale,y:(e.clientY-canvasBox.top)/scale};const raw=rotationFromPointer(p,d.selection);const delta=raw-d.startRotation;const snapped=e.shiftKey?snapRotation(delta,15,8):snapRotation(delta,45,3);const rotated=rotateLayersAroundSelection(d.origins,d.selection,snapped);for(const layer of rotated){workspace.updateLayerLocal(layer.id,{bounds:layer.bounds,transform:layer.transform});} }
 };
 const end=()=>{if(regionDraft){workspace.setRegion(regionDraft);setRegionDraft(null);}if(drag.current)workspace.endHistoryTransaction();drag.current=null;setGuide(null);};
 const regionStart=(e)=>{const box=e.currentTarget.getBoundingClientRect();const x=(e.clientX-box.left)/scale,y=(e.clientY-box.top)/scale;if(workspace.ui.tool==="comment"){workspace.setCommentPoint({x,y});e.stopPropagation();return;}if(workspace.ui.tool!=="region")return;setRegionDraft({x,y,width:1,height:1,startX:x,startY:y});e.stopPropagation();};
 const regionMove=(e)=>{if(!regionDraft)return;const box=e.currentTarget.getBoundingClientRect();const x=(e.clientX-box.left)/scale,y=(e.clientY-box.top)/scale;setRegionDraft({...regionDraft,x:Math.min(regionDraft.startX,x),y:Math.min(regionDraft.startY,y),width:Math.abs(x-regionDraft.startX),height:Math.abs(y-regionDraft.startY)});};
 return <div ref={shell} className="relative flex min-h-full items-center justify-center overflow-auto rounded-2xl border border-[#DDD8D0] bg-[#EEEAE4] p-12" onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
  <div ref={workspaceCanvasRef} className="relative shrink-0 overflow-visible bg-white shadow-[0_30px_100px_rgba(0,0,0,.18)]" style={{width:w,height:h}} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const assetId=e.dataTransfer.getData("application/x-avantiqo-asset");if(!assetId)return;workspace.addLayerLocal({id:crypto.randomUUID(),artboard_id:board.id,parent_layer_id:null,source_asset_id:assetId,layer_type:"IMAGE",name:"Placed asset",bounds:{x:board.width*.15,y:board.height*.15,width:board.width*.7,height:board.height*.7},transform:{rotation:0},style:{},content:{},sort_order:layers.length+1,visible:true,locked:false,metadata:{focal_point:{x:.5,y:.5}}});}} onPointerDown={(e)=>{workspace.selectLayers([]);regionStart(e);}} onPointerMove={regionMove} onPointerUp={end}>
   {workspace.ui.grid?<><div className="pointer-events-none absolute inset-0 z-[2] opacity-10" style={{backgroundImage:"linear-gradient(to right,#000 1px,transparent 1px),linear-gradient(to bottom,#000 1px,transparent 1px)",backgroundSize:`${Math.max(8,board.width/12)*scale}px ${Math.max(8,board.height/12)*scale}px`}}/><div className="pointer-events-none absolute z-[3] border border-dashed border-[#D6A66A]/45" style={{left:safe.x*scale,top:safe.y*scale,width:safe.width*scale,height:safe.height*scale}}/></>:null}
   {workspace.comments.filter((comment)=>comment.artboard_id===board.id&&comment.status!=="RESOLVED").map((comment,index)=><button type="button" key={comment.id||index} title={comment.body||"Comment"} onClick={(event)=>{event.stopPropagation();workspace.focusComment(comment);}} className={`absolute z-[70] flex h-5 w-5 items-center justify-center rounded-full text-[8px] font-bold text-[#3A3026] ${workspace.ui.comment_focus_id===comment.id?"bg-white ring-2 ring-[#D6A66A]":"bg-[#D6A66A]"}`} style={{left:n(comment.position?.x)*scale-10,top:n(comment.position?.y)*scale-10}}>{index+1}</button>)}
   {workspace.ui.comment_point?<div className="pointer-events-none absolute z-[75] h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#8E857C]/50 bg-[#D6A66A]" style={{left:workspace.ui.comment_point.x*scale,top:workspace.ui.comment_point.y*scale}}/>:null}
   {(regionDraft||workspace.ui.region)?<div className="pointer-events-none absolute z-[60] border border-[#D6A66A] bg-[#D6A66A]/10" style={{left:(regionDraft||workspace.ui.region).x*scale,top:(regionDraft||workspace.ui.region).y*scale,width:(regionDraft||workspace.ui.region).width*scale,height:(regionDraft||workspace.ui.region).height*scale}}/>:null}{guide?.x!==null&&guide?.x!==undefined?<div className="pointer-events-none absolute bottom-0 top-0 z-50 w-px bg-[#D6A66A]/80" style={{left:guide.x*scale}}/>:null}{guide?.y!==null&&guide?.y!==undefined?<div className="pointer-events-none absolute left-0 right-0 z-50 h-px bg-[#D6A66A]/80" style={{top:guide.y*scale}}/>:null}
   {layers.map(layer=>{if(!layer.visible)return null;const r=rect(layer),selected=workspace.selection.layer_ids.includes(layer.id),asset=assetFor(layer,assets),u=urlFor(asset),rot=n(layer.transform?.rotation);const preview=imageStudioPreviewGeometry(layer,sourceSize(asset,r),scale);const effects=imageStudioPreviewEffectStyle(layer.style||{});const style={left:r.x*scale,top:r.y*scale,width:r.width*scale,height:r.height*scale,transform:`rotate(${rot}deg)`,zIndex:10+layer.sort_order,opacity:effects.opacity,mixBlendMode:effects.mixBlendMode,filter:layer.layer_type==="IMAGE"?effects.filter:undefined};return <div key={layer.id} className={`absolute ${selected&&selectedLayers.length===1?"ring-1 ring-[#D6A66A]":""}`} style={style} onPointerDown={e=>beginMove(e,layer)}>
    {layer.layer_type==="TEXT"?(()=>{const measured=measureImageStudioText({text:layer.content?.text||"Text",bounds:r,style:layer.style||{}});const justify=measured.verticalAlign==="middle"?"center":measured.verticalAlign==="bottom"?"flex-end":"flex-start";return <div className="flex h-full w-full overflow-hidden whitespace-pre" style={{fontSize:measured.fontSize*scale,fontWeight:measured.weight,fontFamily:fonts.fontFamilyFor(layer.style||{}),color:layer.style?.color||"#111",lineHeight:measured.lineHeight,letterSpacing:measured.letterSpacing*scale,textAlign:measured.align,justifyContent:justify,flexDirection:"column"}}>{measured.visibleLines.join("\n")}</div>;})():u?<div className="relative h-full w-full overflow-hidden" style={{borderRadius:preview.frame.borderRadius}}><Image src={u} alt={layer.name||"Layer"} width={Math.max(1,Math.round(preview.image.width))} height={Math.max(1,Math.round(preview.image.height))} sizes={`${Math.ceil(r.width)}px`} style={{position:"absolute",left:preview.image.left,top:preview.image.top,width:preview.image.width,height:preview.image.height,maxWidth:"none"}} draggable={false}/></div>:<div className="h-full w-full border border-dashed border-[#D8D3CB] bg-[#F2EFEA]"/>}
    {selected&&selectedLayers.length===1&&!layer.locked?<TransformHandles onHandle={(e,h)=>beginTransform(e,"resize",h)} onRotate={e=>beginTransform(e,"rotate")}/>:null}
   </div>;})}
   {selectedLayers.length>1&&selectedBox?<div className="pointer-events-none absolute z-[85] border border-[#D6A66A]" style={{left:selectedBox.x*scale,top:selectedBox.y*scale,width:selectedBox.width*scale,height:selectedBox.height*scale}}><div className="pointer-events-auto absolute inset-0"><TransformHandles multi onHandle={(e,h)=>beginTransform(e,"resize",h)} onRotate={e=>beginTransform(e,"rotate")}/></div></div>:null}
  </div>
 </div>;
}
