"use client";

import { useEffect, useMemo, useState } from "react";
import { buildImageStudioGrainPixels, normalizeImageStudioTextureIntegration } from "@/lib/creative/stills/runtime/CreativeImageStudioTextureCoreRuntime.js";

const TILE_SIZE=1024;
const grainUrlCache=new Map();
const cacheKey=(settings)=>[
  settings.grain_amount,
  settings.grain_size,
  settings.grain_seed,
  settings.grain_monochrome?"mono":"chroma",
].join(":");

function rememberGrainUrl(key,url){
  grainUrlCache.set(key,url);
  if(grainUrlCache.size>12)grainUrlCache.delete(grainUrlCache.keys().next().value);
}

export default function ImageStudioTexturePreviewOverlay({style={},scale=1,selected=false}){
  const settings=useMemo(()=>normalizeImageStudioTextureIntegration(style),[
    style?.texture_integration?.sharpen_sigma,
    style?.texture_integration?.grain_amount,
    style?.texture_integration?.grain_size,
    style?.texture_integration?.grain_seed,
    style?.texture_integration?.grain_monochrome,
    style?.texture_integration?.bloom_strength,
    style?.texture_integration?.bloom_radius_px,
    style?.texture_integration?.bloom_threshold,
  ]);
  const [grainUrl,setGrainUrl]=useState(null);
  const key=cacheKey(settings);

  useEffect(()=>{
    if(settings.grain_amount<=0){setGrainUrl(null);return;}
    const cached=grainUrlCache.get(key);
    if(cached){setGrainUrl(cached);return;}
    const grain=buildImageStudioGrainPixels({texture_integration:settings},TILE_SIZE);
    const canvas=document.createElement("canvas");
    canvas.width=grain.width;canvas.height=grain.height;
    const context=canvas.getContext("2d");
    if(!context){setGrainUrl(null);return;}
    const image=context.createImageData(grain.width,grain.height);
    image.data.set(grain.pixels);
    context.putImageData(image,0,0);
    const url=canvas.toDataURL("image/png");
    rememberGrainUrl(key,url);
    setGrainUrl(url);
  },[key,settings.grain_amount,settings.grain_size,settings.grain_seed,settings.grain_monochrome]);

  const exportOnly=settings.sharpen_sigma>0||settings.bloom_strength>0;
  return <>
    {grainUrl?<div data-texture-grain-preview className="pointer-events-none absolute inset-0" style={{backgroundImage:`url("${grainUrl}")`,backgroundRepeat:"repeat",backgroundSize:`${TILE_SIZE*Math.max(.0001,Number(scale)||1)}px ${TILE_SIZE*Math.max(.0001,Number(scale)||1)}px`,mixBlendMode:"overlay"}}/>:null}
    {selected&&exportOnly?<div data-texture-export-authoritative className="pointer-events-none absolute right-1 top-1 z-[8] rounded border border-[#D6A66A]/40 bg-white/90 px-1.5 py-0.5 text-[7px] font-medium text-[#8A6A42]">Bloom / sharpen · export authoritative</div>:null}
  </>;
}
