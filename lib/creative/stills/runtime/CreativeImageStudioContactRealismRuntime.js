export const CREATIVE_IMAGE_STUDIO_CONTACT_REALISM_CONTRACT="CREATIVE_IMAGE_STUDIO_CONTACT_REALISM_V1";

function n(v,f=0){const x=Number(v);return Number.isFinite(x)?x:f;}
function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function hex(value,fallback="#ffffff"){
  const text=String(value||fallback).replace("#","");
  if(!/^[0-9a-f]{6}$/i.test(text))return hex(fallback,"#ffffff");
  return [0,2,4].map(i=>parseInt(text.slice(i,i+2),16));
}

export function normalizeImageStudioContactRealism(style={}){
  const c=style.contact_realism&&typeof style.contact_realism==="object"?style.contact_realism:{};
  return Object.freeze({
    light_wrap_strength:clamp(n(c.light_wrap_strength,0),0,1),
    light_wrap_width_px:clamp(Math.round(n(c.light_wrap_width_px,0)),0,32),
    light_wrap_color:String(c.light_wrap_color||"#ffffff"),
    shadow_enabled:c.shadow_enabled===true,
    shadow_opacity:clamp(n(c.shadow_opacity,.35),0,1),
    shadow_blur_px:clamp(n(c.shadow_blur_px,24),0,160),
    shadow_offset_x:clamp(n(c.shadow_offset_x,0),-500,500),
    shadow_offset_y:clamp(n(c.shadow_offset_y,18),-500,500),
    shadow_scale_y:clamp(n(c.shadow_scale_y,.22),.03,1),
    shadow_color:String(c.shadow_color||"#000000"),
  });
}

function extractAlpha(raw,width,height,channels){
  const alpha=new Uint8Array(width*height);
  for(let p=0,i=0;p<alpha.length;p++,i+=channels)alpha[p]=raw[i+3];
  return alpha;
}

function minLine(values,radius){
  if(radius<=0)return Uint8Array.from(values);
  const len=values.length,padded=new Uint8Array(len+radius*2);
  padded.fill(values[0]??0,0,radius);padded.set(values,radius);padded.fill(values[len-1]??0,radius+len);
  const out=new Uint8Array(len),deque=new Int32Array(padded.length);
  let head=0,tail=0;const window=radius*2+1;
  for(let i=0;i<padded.length;i++){
    while(head<tail&&deque[head]<=i-window)head++;
    while(head<tail&&padded[deque[tail-1]]>padded[i])tail--;
    deque[tail++]=i;
    if(i>=window-1){const oi=i-window+1;if(oi<len)out[oi]=padded[deque[head]];}
  }
  return out;
}

function erodedAlpha(raw,width,height,channels,radius){
  const alpha=extractAlpha(raw,width,height,channels),horizontal=new Uint8Array(alpha.length);
  for(let y=0;y<height;y++)horizontal.set(minLine(alpha.subarray(y*width,(y+1)*width),radius),y*width);
  const vertical=new Uint8Array(alpha.length),column=new Uint8Array(height);
  for(let x=0;x<width;x++){
    for(let y=0;y<height;y++)column[y]=horizontal[y*width+x];
    const filtered=minLine(column,radius);
    for(let y=0;y<height;y++)vertical[y*width+x]=filtered[y];
  }
  return vertical;
}

export function applyImageStudioLightWrap(raw,width,height,channels,style={}){
  if(!Buffer.isBuffer(raw)&&!(raw instanceof Uint8Array))throw new Error("IMAGE_STUDIO_CONTACT_RAW_BUFFER_REQUIRED");
  if(channels<4)throw new Error("IMAGE_STUDIO_CONTACT_ALPHA_CHANNEL_REQUIRED");
  const settings=normalizeImageStudioContactRealism(style);
  if(settings.light_wrap_strength<=0||settings.light_wrap_width_px<=0)return {bytes:Buffer.from(raw),width,height,channels,settings};
  const out=Buffer.from(raw),color=hex(settings.light_wrap_color);
  const eroded=erodedAlpha(raw,width,height,channels,settings.light_wrap_width_px);
  for(let p=0,i=0;p<width*height;p++,i+=channels){
    const alpha=out[i+3];
    if(alpha===0)continue;
    const edge=clamp(Math.max((alpha-eroded[p])/255,1-alpha/255),0,1);
    if(edge<=0)continue;
    const w=settings.light_wrap_strength*edge;
    out[i]=Math.round(out[i]*(1-w)+color[0]*w);
    out[i+1]=Math.round(out[i+1]*(1-w)+color[1]*w);
    out[i+2]=Math.round(out[i+2]*(1-w)+color[2]*w);
  }
  return {bytes:out,width,height,channels,settings};
}

export function imageStudioShadowSpec(style={}){
  const settings=normalizeImageStudioContactRealism(style);
  const [r,g,b]=hex(settings.shadow_color,"#000000");
  const subjectOpacity=clamp(n(style.opacity,1),0,1);
  const effectiveOpacity=settings.shadow_opacity*subjectOpacity;
  return Object.freeze({
    enabled:settings.shadow_enabled&&effectiveOpacity>0,
    opacity:effectiveOpacity,
    configured_opacity:settings.shadow_opacity,
    subject_opacity:subjectOpacity,
    blur_px:settings.shadow_blur_px,
    offset_x:settings.shadow_offset_x,
    offset_y:settings.shadow_offset_y,
    scale_y:settings.shadow_scale_y,
    color:{r,g,b},
  });
}

export const CreativeImageStudioContactRealismRuntime=Object.freeze({
  contract:CREATIVE_IMAGE_STUDIO_CONTACT_REALISM_CONTRACT,
  normalize:normalizeImageStudioContactRealism,
  applyLightWrap:applyImageStudioLightWrap,
  shadowSpec:imageStudioShadowSpec,
});
export default CreativeImageStudioContactRealismRuntime;
