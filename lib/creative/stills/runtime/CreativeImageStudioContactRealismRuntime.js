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

function alphaAt(raw,width,height,channels,x,y){
  if(x<0||y<0||x>=width||y>=height)return 0;
  return channels>3?raw[(y*width+x)*channels+3]:255;
}

function boundaryWeight(raw,width,height,channels,x,y,radius){
  const center=alphaAt(raw,width,height,channels,x,y);
  if(center<=0||radius<=0)return 0;
  let min=255;
  for(let d=1;d<=radius;d++){
    min=Math.min(min,
      alphaAt(raw,width,height,channels,x-d,y),
      alphaAt(raw,width,height,channels,x+d,y),
      alphaAt(raw,width,height,channels,x,y-d),
      alphaAt(raw,width,height,channels,x,y+d)
    );
    if(min===0)break;
  }
  const distanceSignal=1-min/255;
  const transparencySignal=1-center/255;
  return clamp(Math.max(distanceSignal,transparencySignal),0,1);
}

export function applyImageStudioLightWrap(raw,width,height,channels,style={}){
  if(!Buffer.isBuffer(raw)&&!(raw instanceof Uint8Array))throw new Error("IMAGE_STUDIO_CONTACT_RAW_BUFFER_REQUIRED");
  if(channels<4)throw new Error("IMAGE_STUDIO_CONTACT_ALPHA_CHANNEL_REQUIRED");
  const settings=normalizeImageStudioContactRealism(style);
  if(settings.light_wrap_strength<=0||settings.light_wrap_width_px<=0)return {bytes:Buffer.from(raw),width,height,channels,settings};
  const out=Buffer.from(raw),color=hex(settings.light_wrap_color);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*channels;
    if(out[i+3]===0)continue;
    const edge=boundaryWeight(raw,width,height,channels,x,y,settings.light_wrap_width_px);
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
  return Object.freeze({
    enabled:settings.shadow_enabled&&settings.shadow_opacity>0,
    opacity:settings.shadow_opacity,
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
