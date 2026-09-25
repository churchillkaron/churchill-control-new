export const CREATIVE_IMAGE_STUDIO_RETOUCH_CONTRACT = "CREATIVE_IMAGE_STUDIO_RETOUCH_V2";

function n(v,f=0){const x=Number(v);return Number.isFinite(x)?x:f;}
function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function list(v){return Array.isArray(v)?v.filter(Boolean):[];}
function normalizedRegion(region,layer){
  const b=layer?.bounds||{}; const bw=Math.max(1,n(b.width,1)),bh=Math.max(1,n(b.height,1));
  const left=Math.max(n(b.x),n(region?.x)); const top=Math.max(n(b.y),n(region?.y));
  const right=Math.min(n(b.x)+bw,n(region?.x)+Math.max(0,n(region?.width)));
  const bottom=Math.min(n(b.y)+bh,n(region?.y)+Math.max(0,n(region?.height)));
  if(right<=left||bottom<=top) throw new Error("IMAGE_STUDIO_RETOUCH_REGION_OUTSIDE_LAYER");
  return {x:clamp((left-n(b.x))/bw,0,1),y:clamp((top-n(b.y))/bh,0,1),width:clamp((right-left)/bw,0,1),height:clamp((bottom-top)/bh,0,1)};
}

export function normalizeImageStudioRetouchRegion(region,layer){
  if(Math.abs(n(layer?.transform?.rotation))>.001) throw new Error("IMAGE_STUDIO_RETOUCH_ROTATED_LAYER_UNSUPPORTED");
  return normalizedRegion(region,layer);
}

export function buildImageStudioRetouchOperation({kind,region,source_region=null,layer,amount=.18,feather=.45}={}){
  const type=String(kind||"").toUpperCase();
  if(!["DODGE","BURN","CLONE","HEAL"].includes(type)) throw new Error(`IMAGE_STUDIO_RETOUCH_KIND_UNSUPPORTED:${type||"EMPTY"}`);
  if(Math.abs(n(layer?.transform?.rotation))>.001) throw new Error("IMAGE_STUDIO_RETOUCH_ROTATED_LAYER_UNSUPPORTED");
  const destination=normalizedRegion(region,layer);
  const source=["CLONE","HEAL"].includes(type)?normalizedRegion(source_region,layer):null;
  if(source && (Math.abs(source.width-destination.width)>.0001 || Math.abs(source.height-destination.height)>.0001)) {
    throw new Error("IMAGE_STUDIO_RETOUCH_SOURCE_DESTINATION_SIZE_MISMATCH");
  }
  return Object.freeze({
    id:`retouch-${globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`}`,
    kind:type,
    region:destination,
    source_region:source,
    amount:clamp(n(amount,type==="HEAL"?.72:type==="CLONE"?1:.18),.01,1),
    feather:clamp(n(feather,.45),0,1),
    preserve_alpha:true,
    source_preserving:true,
  });
}

function featherWeight(nx,ny,region,feather){
  const cx=region.x+region.width/2,cy=region.y+region.height/2;
  const rx=Math.max(region.width/2,1e-6),ry=Math.max(region.height/2,1e-6);
  const d=Math.sqrt(((nx-cx)/rx)**2+((ny-cy)/ry)**2);
  if(d>=1)return 0;
  const inner=Math.max(0,1-feather);
  if(d<=inner)return 1;
  const t=(1-d)/Math.max(1e-6,1-inner);
  return t*t*(3-2*t);
}
function bounds(region,width,height){
  return {x0:Math.max(0,Math.floor(clamp(n(region.x),0,1)*width)),y0:Math.max(0,Math.floor(clamp(n(region.y),0,1)*height)),x1:Math.min(width,Math.ceil(clamp(n(region.x)+n(region.width),0,1)*width)),y1:Math.min(height,Math.ceil(clamp(n(region.y)+n(region.height),0,1)*height))};
}
function meanRgb(buffer,width,channels,box){
  const sum=[0,0,0]; let count=0;
  for(let y=box.y0;y<box.y1;y++)for(let x=box.x0;x<box.x1;x++){const i=(y*width+x)*channels;sum[0]+=buffer[i];sum[1]+=buffer[i+1];sum[2]+=buffer[i+2];count++;}
  return count?sum.map(v=>v/count):[0,0,0];
}

export function applyImageStudioRetouchOperations(raw,width,height,channels,operations=[]){
  if(!Buffer.isBuffer(raw)&&!(raw instanceof Uint8Array)) throw new Error("IMAGE_STUDIO_RETOUCH_RAW_BUFFER_REQUIRED");
  if(channels<3) throw new Error("IMAGE_STUDIO_RETOUCH_RGB_CHANNELS_REQUIRED");
  const out=Buffer.from(raw);
  const normalized=list(operations).filter(op=>["DODGE","BURN","CLONE","HEAL"].includes(String(op?.kind||"").toUpperCase()));
  for(const op of normalized){
    const region=op.region||{}; const amount=clamp(n(op.amount,.18),.01,1),feather=clamp(n(op.feather,.45),0,1);
    const dest=bounds(region,width,height);
    const sourceSnapshot=Buffer.from(out);
    if(op.kind==="DODGE"||op.kind==="BURN"){
      for(let y=dest.y0;y<dest.y1;y++)for(let x=dest.x0;x<dest.x1;x++){
        const w=featherWeight((x+.5)/width,(y+.5)/height,region,feather); if(w<=0)continue;
        const i=(y*width+x)*channels; const strength=amount*w;
        for(let c=0;c<3;c++){const v=out[i+c];out[i+c]=Math.round(op.kind==="DODGE"?v+(255-v)*strength:v*(1-strength));}
      }
      continue;
    }
    const sourceRegion=op.source_region||{}; const src=bounds(sourceRegion,width,height);
    const dw=Math.max(1,dest.x1-dest.x0),dh=Math.max(1,dest.y1-dest.y0),sw=Math.max(1,src.x1-src.x0),sh=Math.max(1,src.y1-src.y0);
    const srcMean=op.kind==="HEAL"?meanRgb(sourceSnapshot,width,channels,src):null;
    const dstMean=op.kind==="HEAL"?meanRgb(sourceSnapshot,width,channels,dest):null;
    for(let y=dest.y0;y<dest.y1;y++)for(let x=dest.x0;x<dest.x1;x++){
      const nx=(x-dest.x0+.5)/dw,ny=(y-dest.y0+.5)/dh;
      const sx=Math.min(src.x1-1,src.x0+Math.floor(nx*sw)),sy=Math.min(src.y1-1,src.y0+Math.floor(ny*sh));
      const si=(sy*width+sx)*channels,di=(y*width+x)*channels;
      const w=featherWeight((x+.5)/width,(y+.5)/height,region,feather)*amount; if(w<=0)continue;
      for(let c=0;c<3;c++){
        let sampled=sourceSnapshot[si+c];
        if(op.kind==="HEAL") sampled=clamp(sampled+(dstMean[c]-srcMean[c]),0,255);
        out[di+c]=Math.round(out[di+c]*(1-w)+sampled*w);
      }
    }
  }
  return {bytes:out,width,height,channels,operation_count:normalized.length};
}

export const CreativeImageStudioRetouchRuntime=Object.freeze({contract:CREATIVE_IMAGE_STUDIO_RETOUCH_CONTRACT,normalizeRegion:normalizeImageStudioRetouchRegion,buildOperation:buildImageStudioRetouchOperation,applyPixels:applyImageStudioRetouchOperations});
export default CreativeImageStudioRetouchRuntime;
