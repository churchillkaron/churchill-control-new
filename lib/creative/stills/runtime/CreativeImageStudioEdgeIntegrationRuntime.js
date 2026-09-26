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

function extractAlpha(source,width,height,channels){
  const alpha=new Uint8Array(width*height);
  for(let p=0,i=0;p<alpha.length;p++,i+=channels)alpha[p]=source[i+3];
  return alpha;
}

function writeAlpha(source,alpha,width,height,channels){
  const out=Buffer.from(source);
  for(let p=0,i=0;p<width*height;p++,i+=channels)out[i+3]=alpha[p];
  return out;
}

function extremaLine(values,radius,wantMin){
  if(radius<=0)return Uint8Array.from(values);
  const len=values.length,padded=new Uint8Array(len+radius*2);
  padded.fill(values[0]??0,0,radius);
  padded.set(values,radius);
  padded.fill(values[len-1]??0,radius+len);
  const out=new Uint8Array(len),deque=new Int32Array(padded.length);
  let head=0,tail=0;
  const window=radius*2+1;
  for(let i=0;i<padded.length;i++){
    while(head<tail&&deque[head]<=i-window)head++;
    while(head<tail){
      const last=deque[tail-1];
      if(wantMin?padded[last]<=padded[i]:padded[last]>=padded[i])break;
      tail--;
    }
    deque[tail++]=i;
    if(i>=window-1){
      const outIndex=i-window+1;
      if(outIndex<len)out[outIndex]=padded[deque[head]];
    }
  }
  return out;
}

function blurLine(values,radius){
  if(radius<=0)return Uint8Array.from(values);
  const len=values.length,prefix=new Int32Array(len+1),out=new Uint8Array(len);
  for(let i=0;i<len;i++)prefix[i+1]=prefix[i]+values[i];
  for(let i=0;i<len;i++){
    const left=Math.max(0,i-radius),right=Math.min(len-1,i+radius);
    const sum=prefix[right+1]-prefix[left],count=right-left+1;
    out[i]=Math.round(sum/count);
  }
  return out;
}

function separableAlpha(source,width,height,channels,radius,operation){
  if(!radius)return Buffer.from(source);
  const alpha=extractAlpha(source,width,height,channels);
  const horizontal=new Uint8Array(alpha.length);
  for(let y=0;y<height;y++){
    const line=alpha.subarray(y*width,(y+1)*width);
    const filtered=operation==="BLUR"?blurLine(line,radius):extremaLine(line,radius,operation==="MIN");
    horizontal.set(filtered,y*width);
  }
  const vertical=new Uint8Array(alpha.length),column=new Uint8Array(height);
  for(let x=0;x<width;x++){
    for(let y=0;y<height;y++)column[y]=horizontal[y*width+x];
    const filtered=operation==="BLUR"?blurLine(column,radius):extremaLine(column,radius,operation==="MIN");
    for(let y=0;y<height;y++)vertical[y*width+x]=filtered[y];
  }
  return writeAlpha(source,vertical,width,height,channels);
}

function morphAlpha(source,width,height,channels,radius,shrink){
  return separableAlpha(source,width,height,channels,radius,shrink?"MIN":"MAX");
}

function softenAlpha(source,width,height,channels,radius){
  return separableAlpha(source,width,height,channels,radius,"BLUR");
}

function strongestInteriorNeighbor(source,width,height,channels,x,y,radius=2){
  let best=null,bestAlpha=-1,bestDistance=Infinity;
  for(let oy=-radius;oy<=radius;oy++)for(let ox=-radius;ox<=radius;ox++){
    const xx=x+ox,yy=y+oy;
    if(xx<0||yy<0||xx>=width||yy>=height)continue;
    const i=(yy*width+xx)*channels;
    const a=channels>3?source[i+3]:255;
    const distance=ox*ox+oy*oy;
    if(a>bestAlpha||(a===bestAlpha&&distance<bestDistance)){bestAlpha=a;bestDistance=distance;best=i;}
  }
  return best;
}

function propagateRevealedEdgeColor(original,current,width,height,channels){
  const pixelCount=width*height;
  const owner=new Int32Array(pixelCount);
  owner.fill(-1);
  const queue=new Int32Array(pixelCount);
  let head=0,tail=0;
  let seedCount=0;
  for(let p=0,i=0;p<pixelCount;p++,i+=channels){
    if(current[i+3]<=0||original[i+3]<32)continue;
    owner[p]=p;
    queue[tail++]=p;
    seedCount++;
  }
  if(seedCount===0){
    for(let p=0,i=0;p<pixelCount;p++,i+=channels){
      if(current[i+3]<=0||original[i+3]<=0)continue;
      owner[p]=p;
      queue[tail++]=p;
      seedCount++;
    }
  }
  if(seedCount===0)return {bytes:Buffer.from(current),propagated_pixel_count:0};
  const out=Buffer.from(current);
  let propagated=0;
  while(head<tail){
    const p=queue[head++];
    const x=p%width,y=Math.floor(p/width);
    const neighbors=[p-1,p+1,p-width,p+width];
    for(let k=0;k<neighbors.length;k++){
      const q=neighbors[k];
      if(q<0||q>=pixelCount||owner[q]!==-1)continue;
      if((k===0&&x===0)||(k===1&&x===width-1)||(k===2&&y===0)||(k===3&&y===height-1))continue;
      const qi=q*channels;
      if(current[qi+3]<=0)continue;
      owner[q]=owner[p];
      queue[tail++]=q;
    }
  }
  for(let p=0,i=0;p<pixelCount;p++,i+=channels){
    if(original[i+3]>0||current[i+3]<=0)continue;
    const sourcePixel=owner[p];
    if(sourcePixel<0)continue;
    const sourceIndex=sourcePixel*channels;
    out[i]=original[sourceIndex];
    out[i+1]=original[sourceIndex+1];
    out[i+2]=original[sourceIndex+2];
    propagated++;
  }
  return {bytes:out,propagated_pixel_count:propagated};
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
  const original=Buffer.from(raw);
  let current=Buffer.from(raw);
  if(settings.matte_choke_px!==0){
    current=morphAlpha(current,width,height,channels,Math.abs(settings.matte_choke_px),settings.matte_choke_px>0);
  }
  if(settings.edge_soften_px>0)current=softenAlpha(current,width,height,channels,settings.edge_soften_px);
  let propagatedPixelCount=0;
  if(settings.matte_choke_px<0||settings.edge_soften_px>0){
    const propagated=propagateRevealedEdgeColor(original,current,width,height,channels);
    current=propagated.bytes;
    propagatedPixelCount=propagated.propagated_pixel_count;
  }
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
  return {bytes:current,width,height,channels,settings,propagated_pixel_count:propagatedPixelCount,edge_color_propagation:true};
}

export const CreativeImageStudioEdgeIntegrationRuntime=Object.freeze({
  contract:CREATIVE_IMAGE_STUDIO_EDGE_INTEGRATION_CONTRACT,
  normalize:normalizeImageStudioEdgeIntegration,
  applyPixels:applyImageStudioEdgeIntegration,
});
export default CreativeImageStudioEdgeIntegrationRuntime;
