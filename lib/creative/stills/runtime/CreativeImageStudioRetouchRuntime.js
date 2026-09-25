export const CREATIVE_IMAGE_STUDIO_RETOUCH_CONTRACT = "CREATIVE_IMAGE_STUDIO_RETOUCH_V1";

function n(v,f=0){const x=Number(v);return Number.isFinite(x)?x:f;}
function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function list(v){return Array.isArray(v)?v.filter(Boolean):[];}

export function buildImageStudioRetouchOperation({kind,region,layer,amount=.18,feather=.45}={}){
  const type=String(kind||"").toUpperCase();
  if(!["DODGE","BURN"].includes(type)) throw new Error(`IMAGE_STUDIO_RETOUCH_KIND_UNSUPPORTED:${type||"EMPTY"}`);
  if(Math.abs(n(layer?.transform?.rotation))>.001) throw new Error("IMAGE_STUDIO_RETOUCH_ROTATED_LAYER_UNSUPPORTED");
  const b=layer?.bounds||{}; const bw=Math.max(1,n(b.width,1)),bh=Math.max(1,n(b.height,1));
  const left=Math.max(n(b.x),n(region?.x)); const top=Math.max(n(b.y),n(region?.y));
  const right=Math.min(n(b.x)+bw,n(region?.x)+Math.max(0,n(region?.width)));
  const bottom=Math.min(n(b.y)+bh,n(region?.y)+Math.max(0,n(region?.height)));
  if(right<=left||bottom<=top) throw new Error("IMAGE_STUDIO_RETOUCH_REGION_OUTSIDE_LAYER");
  return Object.freeze({
    id:`retouch-${globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`}`,
    kind:type,
    region:{x:clamp((left-n(b.x))/bw,0,1),y:clamp((top-n(b.y))/bh,0,1),width:clamp((right-left)/bw,0,1),height:clamp((bottom-top)/bh,0,1)},
    amount:clamp(n(amount,.18),.01,1),
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

export function applyImageStudioRetouchOperations(raw,width,height,channels,operations=[]){
  if(!Buffer.isBuffer(raw)&&!(raw instanceof Uint8Array)) throw new Error("IMAGE_STUDIO_RETOUCH_RAW_BUFFER_REQUIRED");
  if(channels<3) throw new Error("IMAGE_STUDIO_RETOUCH_RGB_CHANNELS_REQUIRED");
  const out=Buffer.from(raw);
  const normalized=list(operations).filter(op=>["DODGE","BURN"].includes(String(op?.kind||"").toUpperCase()));
  for(const op of normalized){
    const region=op.region||{}; const amount=clamp(n(op.amount,.18),.01,1),feather=clamp(n(op.feather,.45),0,1);
    const x0=Math.max(0,Math.floor(clamp(n(region.x),0,1)*width));
    const y0=Math.max(0,Math.floor(clamp(n(region.y),0,1)*height));
    const x1=Math.min(width,Math.ceil(clamp(n(region.x)+n(region.width),0,1)*width));
    const y1=Math.min(height,Math.ceil(clamp(n(region.y)+n(region.height),0,1)*height));
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
      const w=featherWeight((x+.5)/width,(y+.5)/height,region,feather); if(w<=0)continue;
      const i=(y*width+x)*channels; const strength=amount*w;
      for(let c=0;c<3;c++){
        const v=out[i+c];
        out[i+c]=Math.round(op.kind==="DODGE"?v+(255-v)*strength:v*(1-strength));
      }
    }
  }
  return {bytes:out,width,height,channels,operation_count:normalized.length};
}

export const CreativeImageStudioRetouchRuntime=Object.freeze({contract:CREATIVE_IMAGE_STUDIO_RETOUCH_CONTRACT,buildOperation:buildImageStudioRetouchOperation,applyPixels:applyImageStudioRetouchOperations});
export default CreativeImageStudioRetouchRuntime;
