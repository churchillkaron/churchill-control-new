export const CREATIVE_IMAGE_STUDIO_RETOUCH_CONTRACT = "CREATIVE_IMAGE_STUDIO_RETOUCH_V3";

function n(v,f=0){const x=Number(v);return Number.isFinite(x)?x:f;}
function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function list(v){return Array.isArray(v)?v.filter(Boolean):[];}
function rotatePoint(x,y,cx,cy,degrees){
  const radians=degrees*Math.PI/180,cos=Math.cos(radians),sin=Math.sin(radians),dx=x-cx,dy=y-cy;
  return {x:cx+dx*cos-dy*sin,y:cy+dx*sin+dy*cos};
}
function polygonIntersectsUnitSquare(points=[]){
  const square=[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}];
  const axes=[{x:1,y:0},{x:0,y:1}];
  for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];axes.push({x:-(b.y-a.y),y:b.x-a.x});}
  for(const axis of axes){
    const length=Math.hypot(axis.x,axis.y);if(length<1e-9)continue;
    const nx=axis.x/length,ny=axis.y/length;
    const project=(set)=>set.map((p)=>p.x*nx+p.y*ny);
    const pp=project(points),sp=project(square);
    if(Math.max(...pp)<Math.min(...sp)||Math.max(...sp)<Math.min(...pp))return false;
  }
  return true;
}
function normalizedRegion(region,layer){
  const b=layer?.bounds||{},bx=n(b.x),by=n(b.y),bw=Math.max(1,n(b.width,1)),bh=Math.max(1,n(b.height,1));
  const rw=Math.max(0,n(region?.width)),rh=Math.max(0,n(region?.height)),rx=n(region?.x),ry=n(region?.y);
  if(rw<=0||rh<=0)throw new Error("IMAGE_STUDIO_RETOUCH_REGION_OUTSIDE_LAYER");
  const rotation=n(layer?.transform?.rotation);
  if(Math.abs(rotation)<=.001){
    const left=Math.max(bx,rx),top=Math.max(by,ry),right=Math.min(bx+bw,rx+rw),bottom=Math.min(by+bh,ry+rh);
    if(right<=left||bottom<=top)throw new Error("IMAGE_STUDIO_RETOUCH_REGION_OUTSIDE_LAYER");
    return {x:clamp((left-bx)/bw,0,1),y:clamp((top-by)/bh,0,1),width:clamp((right-left)/bw,0,1),height:clamp((bottom-top)/bh,0,1)};
  }
  const cx=bx+bw/2,cy=by+bh/2;
  const artboardCorners=[{x:rx,y:ry},{x:rx+rw,y:ry},{x:rx+rw,y:ry+rh},{x:rx,y:ry+rh}];
  const polygon=artboardCorners.map((point)=>{const local=rotatePoint(point.x,point.y,cx,cy,-rotation);return{x:(local.x-bx)/bw,y:(local.y-by)/bh};});
  if(!polygonIntersectsUnitSquare(polygon))throw new Error("IMAGE_STUDIO_RETOUCH_REGION_OUTSIDE_LAYER");
  const xs=polygon.map((point)=>point.x),ys=polygon.map((point)=>point.y);
  const left=clamp(Math.min(...xs),0,1),top=clamp(Math.min(...ys),0,1),right=clamp(Math.max(...xs),0,1),bottom=clamp(Math.max(...ys),0,1);
  return {x:left,y:top,width:Math.max(0,right-left),height:Math.max(0,bottom-top),polygon,rotation_degrees:-rotation};
}

export function normalizeImageStudioRetouchRegion(region,layer){return normalizedRegion(region,layer);}

function regionExtent(region={}){
  if(Array.isArray(region.polygon)&&region.polygon.length===4){
    const [p0,p1,,p3]=region.polygon;
    return {width:Math.hypot(p1.x-p0.x,p1.y-p0.y),height:Math.hypot(p3.x-p0.x,p3.y-p0.y)};
  }
  return {width:n(region.width),height:n(region.height)};
}

export function imageStudioRetouchPreviewStyle(operation={},width=1,height=1){
  const region=operation?.region||{},amount=clamp(n(operation?.amount,.18),.01,1),feather=clamp(n(operation?.feather,.45),0,1);
  const inner=Math.round((1-feather)*100),kind=String(operation?.kind||"").toUpperCase();
  let geometry;
  if(Array.isArray(region.polygon)&&region.polygon.length===4){
    const [p0,p1,,p3]=region.polygon,w=Math.max(1,n(width,1)),h=Math.max(1,n(height,1));
    const x0=p0.x*w,y0=p0.y*h,x1=p1.x*w,y1=p1.y*h,x3=p3.x*w,y3=p3.y*h;
    const edgeX=x1-x0,edgeY=y1-y0,sideX=x3-x0,sideY=y3-y0;
    geometry={left:x0,top:y0,width:Math.hypot(edgeX,edgeY),height:Math.hypot(sideX,sideY),transform:`rotate(${Math.atan2(edgeY,edgeX)*180/Math.PI}deg)`,transformOrigin:"0 0"};
  }else{
    const x=clamp(n(region.x),0,1),y=clamp(n(region.y),0,1),rw=clamp(n(region.width),0,1),rh=clamp(n(region.height),0,1);
    geometry={left:`${x*100}%`,top:`${y*100}%`,width:`${rw*100}%`,height:`${rh*100}%`};
  }
  if(kind==="CLONE"||kind==="HEAL")return {...geometry,border:"1px dashed rgba(214,166,106,.75)",background:"rgba(214,166,106,.04)"};
  const light=kind==="DODGE",rgba=light?`rgba(255,255,255,${Math.min(.65,amount)})`:`rgba(0,0,0,${Math.min(.6,amount)})`;
  return {...geometry,background:`radial-gradient(ellipse at center, ${rgba} 0%, ${rgba} ${inner}%, transparent 100%)`,mixBlendMode:light?"screen":"multiply"};
}

export function buildImageStudioRetouchOperation({kind,region,source_region=null,layer,amount=.18,feather=.45}={}){
  const type=String(kind||"").toUpperCase();
  if(!["DODGE","BURN","CLONE","HEAL"].includes(type)) throw new Error(`IMAGE_STUDIO_RETOUCH_KIND_UNSUPPORTED:${type||"EMPTY"}`);
  const destination=normalizedRegion(region,layer);
  const source=["CLONE","HEAL"].includes(type)?normalizedRegion(source_region,layer):null;
  const destinationExtent=regionExtent(destination),sourceExtent=source?regionExtent(source):null;
  if(source && (Math.abs(sourceExtent.width-destinationExtent.width)>.0001 || Math.abs(sourceExtent.height-destinationExtent.height)>.0001)) {
    throw new Error("IMAGE_STUDIO_RETOUCH_SOURCE_DESTINATION_SIZE_MISMATCH");
  }
  return Object.freeze({
    id:`retouch-${globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`}`,
    kind:type,region:destination,source_region:source,
    amount:clamp(n(amount,type==="HEAL"?.72:type==="CLONE"?1:.18),.01,1),
    feather:clamp(n(feather,.45),0,1),preserve_alpha:true,source_preserving:true,
    rotation_aware:Array.isArray(destination.polygon),
  });
}

function regionCoordinates(nx,ny,region={}){
  if(Array.isArray(region.polygon)&&region.polygon.length===4){
    const [p0,p1,,p3]=region.polygon,e1={x:p1.x-p0.x,y:p1.y-p0.y},e2={x:p3.x-p0.x,y:p3.y-p0.y};
    const dx=nx-p0.x,dy=ny-p0.y,det=e1.x*e2.y-e1.y*e2.x;
    if(Math.abs(det)<1e-9)return {u:Infinity,v:Infinity,inside:false};
    const u=(dx*e2.y-dy*e2.x)/det,v=(e1.x*dy-e1.y*dx)/det;
    return {u,v,inside:u>=0&&u<=1&&v>=0&&v<=1};
  }
  const width=Math.max(n(region.width),1e-9),height=Math.max(n(region.height),1e-9);
  const u=(nx-n(region.x))/width,v=(ny-n(region.y))/height;
  return {u,v,inside:u>=0&&u<=1&&v>=0&&v<=1};
}
function pointFromRegion(region={},u,v){
  if(Array.isArray(region.polygon)&&region.polygon.length===4){
    const [p0,p1,,p3]=region.polygon;
    return {x:p0.x+u*(p1.x-p0.x)+v*(p3.x-p0.x),y:p0.y+u*(p1.y-p0.y)+v*(p3.y-p0.y)};
  }
  return {x:n(region.x)+u*n(region.width),y:n(region.y)+v*n(region.height)};
}
function featherWeight(nx,ny,region,feather){
  const coordinates=regionCoordinates(nx,ny,region);if(!coordinates.inside)return 0;
  const d=Math.sqrt(((coordinates.u-.5)/.5)**2+((coordinates.v-.5)/.5)**2);
  if(d>=1)return 0;
  const inner=Math.max(0,1-feather);
  if(d<=inner)return 1;
  const t=(1-d)/Math.max(1e-6,1-inner);
  return t*t*(3-2*t);
}
function bounds(region,width,height){
  return {x0:Math.max(0,Math.floor(clamp(n(region.x),0,1)*width)),y0:Math.max(0,Math.floor(clamp(n(region.y),0,1)*height)),x1:Math.min(width,Math.ceil(clamp(n(region.x)+n(region.width),0,1)*width)),y1:Math.min(height,Math.ceil(clamp(n(region.y)+n(region.height),0,1)*height))};
}
function meanRgb(buffer,width,height,channels,region,box){
  const sum=[0,0,0]; let weight=0;
  for(let y=box.y0;y<box.y1;y++)for(let x=box.x0;x<box.x1;x++){
    if(Array.isArray(region.polygon)&&!regionCoordinates((x+.5)/width,(y+.5)/height,region).inside)continue;
    const i=(y*width+x)*channels;
    const alpha=channels>3?buffer[i+3]/255:1;
    if(alpha<=0)continue;
    sum[0]+=buffer[i]*alpha;sum[1]+=buffer[i+1]*alpha;sum[2]+=buffer[i+2]*alpha;weight+=alpha;
  }
  return weight?sum.map(v=>v/weight):[0,0,0];
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
        const i=(y*width+x)*channels; if(channels>3&&out[i+3]<=0)continue; const strength=amount*w;
        for(let c=0;c<3;c++){const v=out[i+c];out[i+c]=Math.round(op.kind==="DODGE"?v+(255-v)*strength:v*(1-strength));}
      }
      continue;
    }
    const sourceRegion=op.source_region||{}; const src=bounds(sourceRegion,width,height);
    const srcMean=op.kind==="HEAL"?meanRgb(sourceSnapshot,width,height,channels,sourceRegion,src):null;
    const dstMean=op.kind==="HEAL"?meanRgb(sourceSnapshot,width,height,channels,region,dest):null;
    for(let y=dest.y0;y<dest.y1;y++)for(let x=dest.x0;x<dest.x1;x++){
      const px=(x+.5)/width,py=(y+.5)/height,coordinates=regionCoordinates(px,py,region);
      if(!coordinates.inside)continue;
      const sourcePoint=pointFromRegion(sourceRegion,coordinates.u,coordinates.v);
      const sx=clamp(Math.floor(sourcePoint.x*width),0,width-1),sy=clamp(Math.floor(sourcePoint.y*height),0,height-1);
      const si=(sy*width+sx)*channels,di=(y*width+x)*channels;
      if(channels>3&&out[di+3]<=0)continue;
      const sourceAlpha=channels>3?sourceSnapshot[si+3]/255:1;
      if(sourceAlpha<=0)continue;
      const w=featherWeight(px,py,region,feather)*amount; if(w<=0)continue;
      for(let c=0;c<3;c++){
        let sampled=sourceSnapshot[si+c];
        if(op.kind==="HEAL") sampled=clamp(sampled+(dstMean[c]-srcMean[c]),0,255);
        out[di+c]=Math.round(out[di+c]*(1-w)+sampled*w);
      }
    }
  }
  return {bytes:out,width,height,channels,operation_count:normalized.length};
}

export const CreativeImageStudioRetouchRuntime=Object.freeze({contract:CREATIVE_IMAGE_STUDIO_RETOUCH_CONTRACT,normalizeRegion:normalizeImageStudioRetouchRegion,previewStyle:imageStudioRetouchPreviewStyle,buildOperation:buildImageStudioRetouchOperation,applyPixels:applyImageStudioRetouchOperations});
export default CreativeImageStudioRetouchRuntime;
