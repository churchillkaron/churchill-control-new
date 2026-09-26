export const CREATIVE_IMAGE_STUDIO_CURVES_CONTRACT = "CREATIVE_IMAGE_STUDIO_CURVES_V1";

export const IMAGE_STUDIO_CURVE_CHANNELS=Object.freeze(["MASTER","RED","GREEN","BLUE"]);
function n(v,f=0){const x=Number(v);return Number.isFinite(x)?x:f;}
function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function channel(v){const next=String(v||"MASTER").toUpperCase();return IMAGE_STUDIO_CURVE_CHANNELS.includes(next)?next:"MASTER";}

export function normalizeImageStudioCurvePoints(points=[]){
  const raw=(Array.isArray(points)?points:[]).map((point)=>({x:clamp(n(point?.x),0,1),y:clamp(n(point?.y),0,1)})).sort((a,b)=>a.x-b.x);
  const unique=[];
  for(const point of raw){
    const existing=unique.findIndex((item)=>Math.abs(item.x-point.x)<.0001);
    if(existing>=0) unique[existing]=point; else unique.push(point);
  }
  if(!unique.some((point)=>point.x<=.0001))unique.unshift({x:0,y:0});
  if(!unique.some((point)=>point.x>=.9999))unique.push({x:1,y:1});
  return unique.sort((a,b)=>a.x-b.x);
}

export function normalizeImageStudioCurves(value={}){
  const curves=value&&typeof value==="object"?value:{};
  return Object.freeze(Object.fromEntries(IMAGE_STUDIO_CURVE_CHANNELS.map((name)=>[name,normalizeImageStudioCurvePoints(curves[name]||[{x:0,y:0},{x:1,y:1}])])));
}

export function buildImageStudioCurveLut(points=[]){
  const normalized=normalizeImageStudioCurvePoints(points);
  const lut=new Uint8Array(256);
  let segment=0;
  for(let i=0;i<256;i++){
    const x=i/255;
    while(segment<normalized.length-2&&x>normalized[segment+1].x)segment++;
    const a=normalized[segment],b=normalized[Math.min(segment+1,normalized.length-1)];
    const span=Math.max(.000001,b.x-a.x);
    const t=clamp((x-a.x)/span,0,1);
    lut[i]=Math.round(clamp((a.y+(b.y-a.y)*t)*255,0,255));
  }
  return lut;
}

export function applyImageStudioCurvesToPixels(raw,width,height,channels,curves={}){
  if(!Buffer.isBuffer(raw)&&!(raw instanceof Uint8Array))throw new Error("IMAGE_STUDIO_CURVES_RAW_BUFFER_REQUIRED");
  if(channels<3)throw new Error("IMAGE_STUDIO_CURVES_RGB_CHANNELS_REQUIRED");
  const normalized=normalizeImageStudioCurves(curves);
  const master=buildImageStudioCurveLut(normalized.MASTER);
  const red=buildImageStudioCurveLut(normalized.RED),green=buildImageStudioCurveLut(normalized.GREEN),blue=buildImageStudioCurveLut(normalized.BLUE);
  const out=Buffer.from(raw);
  for(let i=0;i<out.length;i+=channels){
    out[i]=red[master[out[i]]];
    out[i+1]=green[master[out[i+1]]];
    out[i+2]=blue[master[out[i+2]]];
  }
  return {bytes:out,width,height,channels,curves:normalized};
}

export function updateImageStudioCurvePoint(curves={},curveChannel="MASTER",index=0,point={}){
  const resolved=channel(curveChannel),normalized=normalizeImageStudioCurves(curves);
  const points=normalized[resolved].map((item)=>({...item}));
  if(index<0||index>=points.length)return normalized;
  points[index]={x:clamp(n(point.x,points[index].x),0,1),y:clamp(n(point.y,points[index].y),0,1)};
  return normalizeImageStudioCurves({...normalized,[resolved]:points});
}

export function addImageStudioCurvePoint(curves={},curveChannel="MASTER",point={x:.5,y:.5}){
  const resolved=channel(curveChannel),normalized=normalizeImageStudioCurves(curves);
  return normalizeImageStudioCurves({...normalized,[resolved]:[...normalized[resolved],{x:clamp(n(point.x,.5),0,1),y:clamp(n(point.y,.5),0,1)}]});
}

export function removeImageStudioCurvePoint(curves={},curveChannel="MASTER",index=0){
  const resolved=channel(curveChannel),normalized=normalizeImageStudioCurves(curves);
  const points=normalized[resolved].filter((_,i)=>i!==index);
  return normalizeImageStudioCurves({...normalized,[resolved]:points});
}

export const CreativeImageStudioCurvesRuntime=Object.freeze({contract:CREATIVE_IMAGE_STUDIO_CURVES_CONTRACT,channels:IMAGE_STUDIO_CURVE_CHANNELS,normalize:normalizeImageStudioCurves,lut:buildImageStudioCurveLut,applyPixels:applyImageStudioCurvesToPixels,updatePoint:updateImageStudioCurvePoint,addPoint:addImageStudioCurvePoint,removePoint:removeImageStudioCurvePoint});
export default CreativeImageStudioCurvesRuntime;
