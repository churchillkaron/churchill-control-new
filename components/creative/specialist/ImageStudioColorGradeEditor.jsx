"use client";

import { useState } from "react";

const TONES=["SHADOWS","MIDTONES","HIGHLIGHTS"];
const OUTPUTS=["RED","GREEN","BLUE"];
const RANGES=["REDS","YELLOWS","GREENS","CYANS","BLUES","MAGENTAS","WHITES","NEUTRALS","BLACKS"];

function clamp(value,min,max){const n=Number(value);return Math.max(min,Math.min(max,Number.isFinite(n)?n:0));}
function Numeric({label,value,onChange,min=-100,max=100,step=1}){
  return <label className="block"><span className="text-[7px] uppercase tracking-[.1em] text-[#A09A92]">{label}</span><input type="number" min={min} max={max} step={step} value={value??0} onChange={(event)=>onChange(clamp(event.target.value,min,max))} className="mt-1 w-full rounded border border-[#DDD8D0] bg-white px-2 py-1 text-[9px] text-[#625D56] outline-none focus:border-[#D6A66A]/40"/></label>;
}
function Tabs({items,value,onChange}){
  return <div className="grid gap-1" style={{gridTemplateColumns:`repeat(${Math.min(items.length,4)}, minmax(0,1fr))`}}>{items.map((item)=><button type="button" key={item} onClick={()=>onChange(item)} className={`rounded border px-1 py-1 text-[7px] font-semibold tracking-[.06em] ${value===item?"border-[#D6A66A]/40 bg-[#D6A66A]/10 text-[#8A6A42]":"border-[#E5E1DA] text-[#9A938B]"}`}>{item}</button>)}</div>;
}
function balanceDefault(){return {SHADOWS:{cyan_red:0,magenta_green:0,yellow_blue:0},MIDTONES:{cyan_red:0,magenta_green:0,yellow_blue:0},HIGHLIGHTS:{cyan_red:0,magenta_green:0,yellow_blue:0}};}
function mixerDefault(){return {RED:{r:100,g:0,b:0,constant:0},GREEN:{r:0,g:100,b:0,constant:0},BLUE:{r:0,g:0,b:100,constant:0},preserve_luminosity:true};}
function selectiveDefault(){return Object.fromEntries(RANGES.map((name)=>[name,{cyan:0,magenta:0,yellow:0,black:0}]));}

export default function ImageStudioColorGradeEditor({value={},onChange}){
  const [section,setSection]=useState("BALANCE");
  const [tone,setTone]=useState("MIDTONES");
  const [output,setOutput]=useState("RED");
  const [range,setRange]=useState("REDS");
  const grade={color_balance:{...balanceDefault(),...(value.color_balance||{})},channel_mixer:{...mixerDefault(),...(value.channel_mixer||{})},selective_color:{...selectiveDefault(),...(value.selective_color||{})}};
  const patchBalance=(key,next)=>onChange?.({...grade,color_balance:{...grade.color_balance,[tone]:{...grade.color_balance[tone],[key]:next}}});
  const patchMixer=(key,next)=>onChange?.({...grade,channel_mixer:{...grade.channel_mixer,[output]:{...grade.channel_mixer[output],[key]:next}}});
  const patchSelective=(key,next)=>onChange?.({...grade,selective_color:{...grade.selective_color,[range]:{...grade.selective_color[range],[key]:next}}});
  return <div className="rounded-lg border border-[#DDD8D0] bg-white p-2">
    <div className="flex items-center justify-between"><div className="text-[8px] font-semibold uppercase tracking-[.14em] text-[#99928A]">Professional color grade</div><button type="button" onClick={()=>onChange?.({color_balance:balanceDefault(),channel_mixer:mixerDefault(),selective_color:selectiveDefault()})} className="text-[8px] text-[#8A837A]">Reset all</button></div>
    <div className="mt-2 grid grid-cols-3 gap-1">{[["BALANCE","Balance"],["MIXER","Mixer"],["SELECTIVE","Selective"]].map(([id,label])=><button type="button" key={id} onClick={()=>setSection(id)} className={`rounded border py-1 text-[7px] font-semibold uppercase tracking-[.08em] ${section===id?"border-[#D6A66A]/40 bg-[#D6A66A]/10 text-[#8A6A42]":"border-[#E5E1DA] text-[#9A938B]"}`}>{label}</button>)}</div>
    {section==="BALANCE"?<div className="mt-2 space-y-2"><Tabs items={TONES} value={tone} onChange={setTone}/><div className="grid grid-cols-3 gap-2"><Numeric label="Cyan ↔ Red" value={grade.color_balance[tone]?.cyan_red} onChange={(v)=>patchBalance("cyan_red",v)}/><Numeric label="Magenta ↔ Green" value={grade.color_balance[tone]?.magenta_green} onChange={(v)=>patchBalance("magenta_green",v)}/><Numeric label="Yellow ↔ Blue" value={grade.color_balance[tone]?.yellow_blue} onChange={(v)=>patchBalance("yellow_blue",v)}/></div><div className="text-[7px] leading-3 text-[#AAA49C]">Tone-weighted grading keeps shadows, midtones and highlights independently controllable.</div></div>:null}
    {section==="MIXER"?<div className="mt-2 space-y-2"><Tabs items={OUTPUTS} value={output} onChange={setOutput}/><div className="grid grid-cols-4 gap-2"><Numeric label="Red %" value={grade.channel_mixer[output]?.r} min={-200} max={200} onChange={(v)=>patchMixer("r",v)}/><Numeric label="Green %" value={grade.channel_mixer[output]?.g} min={-200} max={200} onChange={(v)=>patchMixer("g",v)}/><Numeric label="Blue %" value={grade.channel_mixer[output]?.b} min={-200} max={200} onChange={(v)=>patchMixer("b",v)}/><Numeric label="Constant" value={grade.channel_mixer[output]?.constant} onChange={(v)=>patchMixer("constant",v)}/></div><button type="button" onClick={()=>onChange?.({...grade,channel_mixer:{...grade.channel_mixer,preserve_luminosity:grade.channel_mixer.preserve_luminosity===false}})} className={`w-full rounded border py-1 text-[8px] ${grade.channel_mixer.preserve_luminosity!==false?"border-[#D6A66A]/40 bg-[#D6A66A]/10 text-[#8A6A42]":"border-[#E2DED7] text-[#8A837A]"}`}>{grade.channel_mixer.preserve_luminosity!==false?"Preserve luminosity · on":"Preserve luminosity · off"}</button></div>:null}
    {section==="SELECTIVE"?<div className="mt-2 space-y-2"><select value={range} onChange={(event)=>setRange(event.target.value)} className="w-full rounded border border-[#DDD8D0] bg-white px-2 py-1 text-[9px] text-[#625D56]">{RANGES.map((name)=><option key={name} value={name}>{name}</option>)}</select><div className="grid grid-cols-4 gap-2"><Numeric label="Cyan" value={grade.selective_color[range]?.cyan} onChange={(v)=>patchSelective("cyan",v)}/><Numeric label="Magenta" value={grade.selective_color[range]?.magenta} onChange={(v)=>patchSelective("magenta",v)}/><Numeric label="Yellow" value={grade.selective_color[range]?.yellow} onChange={(v)=>patchSelective("yellow",v)}/><Numeric label="Black" value={grade.selective_color[range]?.black} onChange={(v)=>patchSelective("black",v)}/></div><div className="text-[7px] leading-3 text-[#AAA49C]">Hue families plus whites, neutrals and blacks are weighted from each pixel rather than globally shifted.</div></div>:null}
  </div>;
}
