import { applyImageStudioCurvesToPixels, imageStudioCurvesAreIdentity, normalizeImageStudioCurves } from "./CreativeImageStudioCurvesRuntime.js";
import { applyImageStudioColorGrade, normalizeImageStudioColorGrade } from "./CreativeImageStudioColorGradeRuntime.js";
import { applyImageStudioLook, normalizeImageStudioLook } from "./CreativeImageStudioLookRuntime.js";
export const CREATIVE_IMAGE_STUDIO_ADJUSTMENT_CONTRACT = "CREATIVE_IMAGE_STUDIO_ADJUSTMENT_V4";

function n(value,fallback){const x=Number(value);return Number.isFinite(x)?x:fallback;}
function clamp(v,min,max){return Math.max(min,Math.min(max,v));}

export function normalizeImageStudioAdjustments(style={}){
  const a=style.adjustments&&typeof style.adjustments==="object"?style.adjustments:{};
  const levels=a.levels&&typeof a.levels==="object"?a.levels:{};
  return Object.freeze({
    exposure:clamp(n(a.exposure,0),-5,5),
    temperature:clamp(n(a.temperature,0),-100,100),
    tint:clamp(n(a.tint,0),-100,100),
    shadows:clamp(n(a.shadows,0),-100,100),
    highlights:clamp(n(a.highlights,0),-100,100),
    levels:Object.freeze({
      black:clamp(n(levels.black,0),0,254),
      gamma:clamp(n(levels.gamma,1),0.1,9.99),
      white:clamp(n(levels.white,255),1,255),
    }),
    curves:normalizeImageStudioCurves(a.curves||{}),
    color_grade:normalizeImageStudioColorGrade(a.color_grade||{}),
    look:normalizeImageStudioLook(a.look||{}),
  });
}

function toneChannel(value,{black,gamma,white},exposure){
  const range=Math.max(1,white-black);
  let x=clamp((value-black)/range,0,1);
  x=Math.pow(x,1/gamma);
  x*=Math.pow(2,exposure);
  return clamp(x*255,0,255);
}

export function applyImageStudioPixelAdjustments(raw,width,height,channels,style={}){
  const a=normalizeImageStudioAdjustments(style);
  if(!Buffer.isBuffer(raw)&&!(raw instanceof Uint8Array)) throw new Error("IMAGE_STUDIO_ADJUSTMENT_RAW_BUFFER_REQUIRED");
  if(channels<3) throw new Error("IMAGE_STUDIO_ADJUSTMENT_RGB_CHANNELS_REQUIRED");
  const out=Buffer.from(raw);
  const warm=a.temperature/100;
  const tint=a.tint/100;
  const shadowAmount=a.shadows/100;
  const highlightAmount=a.highlights/100;
  for(let i=0;i<out.length;i+=channels){
    let r=toneChannel(out[i],a.levels,a.exposure);
    let g=toneChannel(out[i+1],a.levels,a.exposure);
    let b=toneChannel(out[i+2],a.levels,a.exposure);
    const l=(r+g+b)/(3*255);
    const shadowWeight=Math.pow(1-l,2);
    const highlightWeight=Math.pow(l,2);
    const shadowLift=shadowAmount*shadowWeight*96;
    const highlightLift=highlightAmount*highlightWeight*96;
    r+=shadowLift+highlightLift;
    g+=shadowLift+highlightLift;
    b+=shadowLift+highlightLift;
    r*=1+warm*0.18; b*=1-warm*0.18;
    g*=1+tint*0.12; r*=1-tint*0.04; b*=1-tint*0.04;
    out[i]=Math.round(clamp(r,0,255));
    out[i+1]=Math.round(clamp(g,0,255));
    out[i+2]=Math.round(clamp(b,0,255));
  }
  const curved=imageStudioCurvesAreIdentity(a.curves)?{bytes:out}:{...applyImageStudioCurvesToPixels(out,width,height,channels,a.curves)};
  const graded=applyImageStudioColorGrade(curved.bytes,width,height,channels,a.color_grade);
  const looked=applyImageStudioLook(graded.bytes,width,height,channels,a.look);
  return {bytes:looked.bytes,width,height,channels,adjustments:a};
}

export function imageStudioAdjustmentPreviewStyle(style={}){
  const a=normalizeImageStudioAdjustments(style);
  const exposure=Math.pow(2,a.exposure);
  const warm=a.temperature/100;
  const tint=a.tint/100;
  const brightness=Math.max(0,exposure*(1+(a.shadows+a.highlights)/800));
  const sepia=Math.min(.22,Math.abs(warm)*.22);
  const hue=tint*8;
  return { filter:`brightness(${brightness}) sepia(${sepia}) hue-rotate(${hue}deg)` };
}

export const CreativeImageStudioAdjustmentRuntime=Object.freeze({
  contract:CREATIVE_IMAGE_STUDIO_ADJUSTMENT_CONTRACT,
  normalize:normalizeImageStudioAdjustments,
  applyPixels:applyImageStudioPixelAdjustments,
  previewStyle:imageStudioAdjustmentPreviewStyle,
});
export default CreativeImageStudioAdjustmentRuntime;
