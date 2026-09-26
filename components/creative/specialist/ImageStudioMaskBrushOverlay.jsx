"use client";

import { useRef, useState } from "react";
import { imageStudioBrushFeatherSigma } from "@/lib/creative/stills/runtime/CreativeImageStudioBrushMaskRuntime.js";

const n=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export default function ImageStudioMaskBrushOverlay({workspace,scale=1,layers=[]}){
  const selectedId=workspace.selection.layer_ids?.length===1?workspace.selection.layer_ids[0]:null;
  const mask=layers.find((layer)=>layer.id===selectedId&&layer.layer_type==="MASK");
  const drawing=useRef(null);
  const [draft,setDraft]=useState(null);
  if(!mask||workspace.ui.tool!=="mask_brush")return null;
  const b=mask.bounds||{},left=n(b.x)*scale,top=n(b.y)*scale,width=Math.max(1,n(b.width,1))*scale,height=Math.max(1,n(b.height,1))*scale;
  const normalize=(event)=>{
    const box=event.currentTarget.getBoundingClientRect();
    return {x:clamp((event.clientX-box.left)/Math.max(1,box.width),0,1),y:clamp((event.clientY-box.top)/Math.max(1,box.height),0,1)};
  };
  const start=(event)=>{event.stopPropagation();const point=normalize(event);drawing.current=[point];setDraft([point]);event.currentTarget.setPointerCapture?.(event.pointerId);};
  const move=(event)=>{if(!drawing.current)return;const point=normalize(event);const prev=drawing.current.at(-1);if(prev&&Math.hypot(point.x-prev.x,point.y-prev.y)<.003)return;drawing.current=[...drawing.current,point];setDraft(drawing.current);};
  const end=(event)=>{if(!drawing.current)return;event.stopPropagation();const points=drawing.current;drawing.current=null;setDraft(null);workspace.addMaskBrushStroke(points);};
  const strokes=[...(mask.metadata?.mask_brush_strokes||[]),...(draft?[{id:"draft",mode:workspace.ui.mask_brush_mode||"ADD",points:draft,size_px:workspace.ui.mask_brush_size??40,hardness:workspace.ui.mask_brush_hardness??.8,opacity:workspace.ui.mask_brush_opacity??1}]:[])];
  const filterId=(stroke,index)=>`mask-brush-soft-${String(stroke.id||index).replace(/[^a-zA-Z0-9_-]/g,"-")}`;
  return <div className="absolute z-[96] touch-none cursor-crosshair" style={{left,top,width,height}} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${Math.max(1,n(b.width,1))} ${Math.max(1,n(b.height,1))}`} preserveAspectRatio="none">
      <defs>{strokes.map((stroke,index)=>{const blur=imageStudioBrushFeatherSigma(stroke);return blur>0?<filter key={filterId(stroke,index)} id={filterId(stroke,index)} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation={blur}/></filter>:null;})}</defs>
      {strokes.map((stroke,index)=>{const points=(stroke.points||[]).map((p)=>`${clamp(n(p.x),0,1)*Math.max(1,n(b.width,1))},${clamp(n(p.y),0,1)*Math.max(1,n(b.height,1))}`).join(" ");const blur=imageStudioBrushFeatherSigma(stroke);return <polyline key={stroke.id||index} points={points} fill="none" stroke={String(stroke.mode||"ADD").toUpperCase()==="SUBTRACT"?"rgba(179,107,82,.78)":"rgba(214,166,106,.82)"} strokeWidth={Math.max(1,n(stroke.size_px,40))} strokeOpacity={clamp(n(stroke.opacity,1),.01,1)} strokeLinecap="round" strokeLinejoin="round" filter={blur>0?`url(#${filterId(stroke,index)})`:undefined}/>;})}
    </svg>
  </div>;
}
