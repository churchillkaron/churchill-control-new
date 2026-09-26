export const CREATIVE_IMAGE_STUDIO_BRUSH_MASK_CONTRACT = "CREATIVE_IMAGE_STUDIO_BRUSH_MASK_V1";

function n(v,f=0){const x=Number(v);return Number.isFinite(x)?x:f;}
function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function list(v){return Array.isArray(v)?v.filter(Boolean):[];}

export function buildImageStudioBrushStroke({id,mode="ADD",points=[],size_px=40,hardness=.8,opacity=1}={}){
  const resolvedMode=String(mode||"ADD").toUpperCase();
  if(!["ADD","SUBTRACT"].includes(resolvedMode)) throw new Error("IMAGE_STUDIO_BRUSH_MASK_MODE_UNSUPPORTED");
  const normalized=list(points).map((point)=>({x:clamp(n(point?.x),0,1),y:clamp(n(point?.y),0,1)}));
  if(normalized.length<1) throw new Error("IMAGE_STUDIO_BRUSH_MASK_POINTS_REQUIRED");
  return Object.freeze({
    id:id||`mask-stroke-${globalThis.crypto?.randomUUID?.()||Date.now()}`,
    mode:resolvedMode,points:normalized,size_px:clamp(n(size_px,40),1,500),hardness:clamp(n(hardness,.8),0,1),
    opacity:clamp(n(opacity,1),.01,1),non_destructive:true,
  });
}

export function normalizeImageStudioBrushStrokes(strokes=[]){
  return list(strokes).map((stroke)=>buildImageStudioBrushStroke(stroke));
}

export function imageStudioBrushStrokeSvg(stroke={},region={},width=1,height=1){
  const normalized=buildImageStudioBrushStroke(stroke);
  const rx=n(region.x),ry=n(region.y),rw=Math.max(1,n(region.width,width)),rh=Math.max(1,n(region.height,height));
  const pts=normalized.points.map((point)=>({x:rx+point.x*rw,y:ry+point.y*rh}));
  const d=pts.length===1?`M ${pts[0].x} ${pts[0].y} L ${pts[0].x+.01} ${pts[0].y+.01}`:`M ${pts.map((point)=>`${point.x} ${point.y}`).join(" L ")}`;
  const blur=Math.max(0,(1-normalized.hardness)*normalized.size_px*.45);
  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><defs><filter id="soft"><feGaussianBlur stdDeviation="${blur}"/></filter></defs><rect width="100%" height="100%" fill="black"/><path d="${d}" fill="none" stroke="white" stroke-width="${normalized.size_px}" stroke-linecap="round" stroke-linejoin="round" opacity="${normalized.opacity}" filter="${blur>0?"url(#soft)":""}"/></svg>`;
}

export const CreativeImageStudioBrushMaskRuntime=Object.freeze({
  contract:CREATIVE_IMAGE_STUDIO_BRUSH_MASK_CONTRACT,
  buildStroke:buildImageStudioBrushStroke,
  normalize:normalizeImageStudioBrushStrokes,
  strokeSvg:imageStudioBrushStrokeSvg,
});
export default CreativeImageStudioBrushMaskRuntime;
