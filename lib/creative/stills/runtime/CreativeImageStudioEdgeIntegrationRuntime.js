export const CREATIVE_IMAGE_STUDIO_EDGE_INTEGRATION_CONTRACT="CREATIVE_IMAGE_STUDIO_EDGE_INTEGRATION_V1";

function n(v,f=0){const x=Number(v);return Number.isFinite(x)?x:f;}
function clamp(v,min,max){return Math.max(min,Math.min(max,v));}

export function normalizeImageStudioEdgeIntegration(style={}){
  const e=style.edge_integration&&typeof style.edge_integration==="object"?style.edge_integration:{};
  const spill=String(e.despill_mode||"AUTO").toUpperCase();
  return Object.freeze({
    matte_choke_px:clamp(Math.round(n(e.matte_choke_px,0)),-8,8),
    edge_soften_px:clamp(Math.round(n(e.edge_soften_px,0)),0,12),
    despill_mode:["AUTO","GREEN","BLUE","OFF"].includes(spill)?spill:"AUTO",
    despill_strength:clamp(n(e.despill_strength,0),0,1),
    decontaminate_strength:clamp(n(e.decontaminate_strength,0),0,1),
  });
}

function alphaAt(buffer,width,height,channels,x,y){
  if(x<0||y<0||x>=width||y>=height)return 0;
  return channels>3?buffer[(y*width+x)*channels+3]:255;
}

function morphAlpha(source,width,height,channels,radius,shrink){
  if(!radius)return Buffer.from(source);
  const out=Buffer.from(source);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    let resolved=shrink?255:0;
    for(let oy=-radius;oy<=radius;oy++)for(let ox=-radius;ox<=radius;ox++){
      if(ox*ox+oy*oy>radius*radius)continue;
      const a=alphaAt(source,width,height,channels,x+ox,y+oy);
      resolved=shrink?Math.min(resolved,a):Math.max(resolved,a);
    }
    if(channels>3)out[(y*width+x)*channels+3]=resolved;
  }
  return out;
}

function softenAlpha(source,width,height,channels,radius){
  if(!radius)return Buffer.from(source);
  const out=Buffer.from(source);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    let sum=0,count=0;
    for(let oy=-radius;oy<=radius;oy++)for(let ox=-radius;ox<=radius;ox++){
      if(ox*ox+oy*oy>radius*radius)continue;
      const xx=x+ox,yy=y+oy;
      if(xx<0||yy<0||xx>=width||yy>=height)continue;
      sum+=alphaAt(source,width,height,channels,xx,yy);count++;
    }
    if(channels>3)out[(y*width+x)*channels+3]=count?Math.round(sum/count):alphaAt(source,width,height,channels,x,y);
  }
  return out;
}

function strongestInteriorNeighbor(source,width,height,channels,x,y,radius=2){
  let best=null,bestAlpha=-1;
  for(let oy=-radius;oy<=radius;oy++)for(let ox=-radius;ox<=radius;ox++){
    const xx=x+ox,yy=y+oy;
    if(xx<0||yy<0||xx>=width||yy>=height)continue;
    const i=(yy*width+xx)*channels;
    const a=channels>3?source[i+3]:255;
    if(a>bestAlpha){bestAlpha=a;best=i;}
  }
  return best;
}

function despillPixel(r,g,b,mode,strength,edgeWeight){
  if(mode==="OFF"||strength<=0||edgeWeight<=0)return [r,g,b];
  let channel=mode;
  if(channel==="AUTO"){
    const greenExcess=g-(r+b)/2;
    const blueExcess=b-(r+g)/2;
    channel=greenExcess>blueExcess&&greenExcess>0?"GREEN":blueExcess>0?"BLUE":"OFF";
  }
  const amount=strength*edgeWeight;
  if(channel==="GREEN"){
    const neutral=(r+b)/2;
    g=g+(Math.min(g,neutral)-g)*amount;
  }else if(channel==="BLUE"){
    const neutral=(r+g)/2;
    b=b+(Math.min(b,neutral)-b)*amount;
  }
  return [clamp(r,0,255),clamp(g,0,255),clamp(b,0,255)];
}

export function applyImageStudioEdgeIntegration(raw,width,height,channels,style={}){
  if(!Buffer.isBuffer(raw)&&!(raw instanceof Uint8Array))throw new Error("IMAGE_STUDIO_EDGE_RAW_BUFFER_REQUIRED");
  if(channels<4)throw new Error("IMAGE_STUDIO_EDGE_ALPHA_CHANNEL_REQUIRED");
  const settings=normalizeImageStudioEdgeIntegration(style);
  let current=Buffer.from(raw);
  if(settings.matte_choke_px!==0){
    current=morphAlpha(current,width,height,channels,Math.abs(settings.matte_choke_px),settings.matte_choke_px>0);
  }
  if(settings.edge_soften_px>0)current=softenAlpha(current,width,height,channels,settings.edge_soften_px);
  const source=Buffer.from(current);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*channels;
    const alpha=source[i+3];
    if(alpha<=0||alpha>=255)continue;
    const edgeWeight=1-alpha/255;
    let r=source[i],g=source[i+1],b=source[i+2];
    if(settings.decontaminate_strength>0){
      const neighbor=strongestInteriorNeighbor(source,width,height,channels,x,y,2);
      if(neighbor!=null){
        const w=settings.decontaminate_strength*edgeWeight;
        r=r*(1-w)+source[neighbor]*w;
        g=g*(1-w)+source[neighbor+1]*w;
        b=b*(1-w)+source[neighbor+2]*w;
      }
    }
    [r,g,b]=despillPixel(r,g,b,settings.despill_mode,settings.despill_strength,edgeWeight);
    current[i]=Math.round(clamp(r,0,255));
    current[i+1]=Math.round(clamp(g,0,255));
    current[i+2]=Math.round(clamp(b,0,255));
  }
  return {bytes:current,width,height,channels,settings};
}

export const CreativeImageStudioEdgeIntegrationRuntime=Object.freeze({
  contract:CREATIVE_IMAGE_STUDIO_EDGE_INTEGRATION_CONTRACT,
  normalize:normalizeImageStudioEdgeIntegration,
  applyPixels:applyImageStudioEdgeIntegration,
});
export default CreativeImageStudioEdgeIntegrationRuntime;
