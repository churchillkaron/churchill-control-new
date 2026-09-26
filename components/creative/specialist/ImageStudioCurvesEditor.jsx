"use client";

import { useRef, useState } from "react";

const CHANNELS=["MASTER","RED","GREEN","BLUE"];
const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number(value)||0));
function normalize(points=[]){
  const items=(Array.isArray(points)?points:[]).map((point)=>({x:clamp(point?.x,0,1),y:clamp(point?.y,0,1)})).sort((a,b)=>a.x-b.x);
  if(!items.some((p)=>p.x<=.0001))items.unshift({x:0,y:0});
  if(!items.some((p)=>p.x>=.9999))items.push({x:1,y:1});
  return items;
}
function normalizeCurves(curves={}){
  return Object.fromEntries(CHANNELS.map((name)=>[name,normalize(curves?.[name]||[{x:0,y:0},{x:1,y:1}])]));
}
function pointFromEvent(event,svg){
  const box=svg.getBoundingClientRect();
  return {x:clamp((event.clientX-box.left)/Math.max(1,box.width),0,1),y:clamp(1-(event.clientY-box.top)/Math.max(1,box.height),0,1)};
}
function channelStroke(channel){
  if(channel==="RED")return "#9B554E";
  if(channel==="GREEN")return "#60765B";
  if(channel==="BLUE")return "#5B6682";
  return "#D6A66A";
}

export default function ImageStudioCurvesEditor({curves,onChange,onBegin,onEnd}){
  const [channel,setChannel]=useState("MASTER");
  const drag=useRef(null);
  const svgRef=useRef(null);
  const normalized=normalizeCurves(curves);
  const points=normalized[channel];
  const commit=(next)=>onChange?.({...normalized,[channel]:normalize(next)});
  const add=(event)=>{
    if(event.target!==event.currentTarget)return;
    const point=pointFromEvent(event,svgRef.current);
    commit([...points,point]);
  };
  const begin=(event,index)=>{event.stopPropagation();drag.current=index;onBegin?.();event.currentTarget.setPointerCapture?.(event.pointerId);};
  const move=(event)=>{
    if(drag.current==null||!svgRef.current)return;
    const index=drag.current,point=pointFromEvent(event,svgRef.current);
    const minX=index<=0?0:points[index-1].x+.005,maxX=index>=points.length-1?1:points[index+1].x-.005;\n    const x=index===0?0:index===points.length-1?1:clamp(point.x,minX,maxX);\n    const next=points.map((item,i)=>i===index?{x,y:point.y}:item);
    commit(next);
  };
  const end=()=>{if(drag.current==null)return;drag.current=null;onEnd?.();};
  const remove=(event,index)=>{event.stopPropagation();if(index===0||index===points.length-1)return;commit(points.filter((_,i)=>i!==index));};
  const polyline=points.map((p)=>`${p.x*100},${(1-p.y)*100}`).join(" ");
  return <div className="rounded-lg border border-[#DDD8D0] bg-white p-2">
    <div className="flex items-center justify-between gap-1">
      <div className="text-[8px] font-semibold uppercase tracking-[.14em] text-[#99928A]">RGB curves</div>
      <button type="button" onClick={()=>commit([{x:0,y:0},{x:1,y:1}])} className="text-[8px] text-[#8A837A]">Reset {channel.toLowerCase()}</button>
    </div>
    <div className="mt-2 grid grid-cols-4 gap-1">{CHANNELS.map((name)=><button type="button" key={name} onClick={()=>setChannel(name)} className={`rounded border py-1 text-[7px] font-semibold tracking-[.08em] ${channel===name?"border-[#D6A66A]/40 bg-[#D6A66A]/10 text-[#8A6A42]":"border-[#E5E1DA] text-[#9A938B]"}`}>{name==="MASTER"?"MASTER":name[0]}</button>)}</div>
    <svg ref={svgRef} data-curve-canvas="true" viewBox="0 0 100 100" className="mt-2 aspect-square w-full touch-none rounded border border-[#E5E1DA] bg-[#FBFAF8]" onPointerDown={add} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
      {[25,50,75].map((v)=><g key={v}><line x1={v} y1="0" x2={v} y2="100" stroke="#E9E5DE" strokeWidth=".5"/><line x1="0" y1={v} x2="100" y2={v} stroke="#E9E5DE" strokeWidth=".5"/></g>)}
      <line x1="0" y1="100" x2="100" y2="0" stroke="#D8D3CB" strokeWidth=".65" strokeDasharray="2 2"/>
      <polyline points={polyline} fill="none" stroke={channelStroke(channel)} strokeWidth="1.35" strokeLinejoin="round"/>
      {points.map((point,index)=><circle key={index} cx={point.x*100} cy={(1-point.y)*100} r="2.8" fill="#FBFAF8" stroke={channelStroke(channel)} strokeWidth="1.2" className="cursor-grab active:cursor-grabbing" onPointerDown={(event)=>begin(event,index)} onDoubleClick={(event)=>remove(event,index)}/>)}
    </svg>
    <div className="mt-1 text-[7px] leading-3 text-[#AAA49C]">Click graph to add · drag points · double-click interior point to remove.</div>
  </div>;
}
