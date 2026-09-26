export const CREATIVE_IMAGE_STUDIO_PERSPECTIVE_WARP_CONTRACT = "CREATIVE_IMAGE_STUDIO_PERSPECTIVE_WARP_V1";

function n(v,f=0){const x=Number(v);return Number.isFinite(x)?x:f;}
function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function point(value,fallback){return {x:clamp(n(value?.x,fallback.x),-.5,1.5),y:clamp(n(value?.y,fallback.y),-.5,1.5)};}
const IDENTITY=Object.freeze({top_left:{x:0,y:0},top_right:{x:1,y:0},bottom_right:{x:1,y:1},bottom_left:{x:0,y:1}});

function signedArea(points){let sum=0;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];sum+=a.x*b.y-b.x*a.y;}return sum/2;}
function segmentsIntersect(a,b,c,d){
  const cross=(p,q,r)=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);
  const c1=cross(a,b,c),c2=cross(a,b,d),c3=cross(c,d,a),c4=cross(c,d,b);
  return c1*c2<0&&c3*c4<0;
}
export function normalizeImageStudioPerspectiveWarp(style={}){
  const raw=style.perspective_warp&&typeof style.perspective_warp==="object"?style.perspective_warp:{};
  const corners={
    top_left:point(raw.top_left,IDENTITY.top_left),
    top_right:point(raw.top_right,IDENTITY.top_right),
    bottom_right:point(raw.bottom_right,IDENTITY.bottom_right),
    bottom_left:point(raw.bottom_left,IDENTITY.bottom_left),
  };
  const ordered=[corners.top_left,corners.top_right,corners.bottom_right,corners.bottom_left];
  const degenerate=Math.abs(signedArea(ordered))<.01||segmentsIntersect(ordered[0],ordered[1],ordered[2],ordered[3])||segmentsIntersect(ordered[1],ordered[2],ordered[3],ordered[0]);
  return Object.freeze({enabled:raw.enabled===true&&!degenerate,corners,degenerate});
}
export function imageStudioPerspectiveWarpIsIdentity(style={}){
  const w=normalizeImageStudioPerspectiveWarp(style); if(!w.enabled)return true;
  return Object.keys(IDENTITY).every((key)=>Math.abs(w.corners[key].x-IDENTITY[key].x)<1e-6&&Math.abs(w.corners[key].y-IDENTITY[key].y)<1e-6);
}

function solveLinear(matrix,vector){
  const n=vector.length,a=matrix.map((row,i)=>[...row,vector[i]]);
  for(let col=0;col<n;col++){
    let pivot=col;for(let r=col+1;r<n;r++)if(Math.abs(a[r][col])>Math.abs(a[pivot][col]))pivot=r;
    if(Math.abs(a[pivot][col])<1e-10)throw new Error("IMAGE_STUDIO_PERSPECTIVE_SINGULAR");
    [a[col],a[pivot]]=[a[pivot],a[col]];
    const div=a[col][col];for(let c=col;c<=n;c++)a[col][c]/=div;
    for(let r=0;r<n;r++){if(r===col)continue;const f=a[r][col];for(let c=col;c<=n;c++)a[r][c]-=f*a[col][c];}
  }
  return a.map((row)=>row[n]);
}
function homography(from,to){
  const A=[],b=[];
  for(let i=0;i<4;i++){
    const x=from[i].x,y=from[i].y,u=to[i].x,v=to[i].y;
    A.push([x,y,1,0,0,0,-u*x,-u*y]);b.push(u);
    A.push([0,0,0,x,y,1,-v*x,-v*y]);b.push(v);
  }
  const h=solveLinear(A,b);return [...h,1];
}
function projectPoint(H,point){
  const den=H[6]*point.x+H[7]*point.y+H[8];
  if(Math.abs(den)<1e-10)return null;
  return {x:(H[0]*point.x+H[1]*point.y+H[2])/den,y:(H[3]*point.x+H[4]*point.y+H[5])/den};
}
export function imageStudioPerspectiveCssPreview(style={},width=1,height=1){
  const warp=normalizeImageStudioPerspectiveWarp(style);
  const w=Math.max(1,n(width,1)),h=Math.max(1,n(height,1));
  if(!warp.enabled||imageStudioPerspectiveWarpIsIdentity(style))return Object.freeze({enabled:false,transform:"none",transform_origin:"0 0",matrix:null,corners:warp.corners});
  const src=[{x:0,y:0},{x:w,y:0},{x:w,y:h},{x:0,y:h}];
  const dst=[warp.corners.top_left,warp.corners.top_right,warp.corners.bottom_right,warp.corners.bottom_left].map(p=>({x:p.x*w,y:p.y*h}));
  const H=homography(src,dst);
  const matrix=[
    H[0],H[3],0,H[6],
    H[1],H[4],0,H[7],
    0,0,1,0,
    H[2],H[5],0,H[8],
  ];
  return Object.freeze({enabled:true,transform:`matrix3d(${matrix.map(value=>Number(value.toFixed(12))).join(",")})`,transform_origin:"0 0",matrix:Object.freeze([...H]),corners:warp.corners});
}
export function projectImageStudioPerspectivePoint(matrix,point={}){
  const H=Array.isArray(matrix)?matrix:[];
  if(H.length!==9)return null;
  return projectPoint(H,{x:n(point.x),y:n(point.y)});
}
function sampleBilinear(src,width,height,channels,x,y,c){
  x=clamp(x,0,width-1);y=clamp(y,0,height-1);
  const x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(width-1,x0+1),y1=Math.min(height-1,y0+1),tx=x-x0,ty=y-y0;
  const a=src[(y0*width+x0)*channels+c],b=src[(y0*width+x1)*channels+c],d=src[(y1*width+x0)*channels+c],e=src[(y1*width+x1)*channels+c];
  return a*(1-tx)*(1-ty)+b*tx*(1-ty)+d*(1-tx)*ty+e*tx*ty;
}
export function applyImageStudioPerspectiveWarp(raw,width,height,channels,style={}){
  const warp=normalizeImageStudioPerspectiveWarp(style);
  if(!Buffer.isBuffer(raw)&&!(raw instanceof Uint8Array))throw new Error("IMAGE_STUDIO_PERSPECTIVE_RAW_BUFFER_REQUIRED");
  if(channels<3)throw new Error("IMAGE_STUDIO_PERSPECTIVE_RGB_CHANNELS_REQUIRED");
  if(!warp.enabled||imageStudioPerspectiveWarpIsIdentity(style))return {bytes:Buffer.from(raw),width,height,channels,warp,applied:false};
  if(warp.degenerate)throw new Error("IMAGE_STUDIO_PERSPECTIVE_DEGENERATE");
  const dst=[warp.corners.top_left,warp.corners.top_right,warp.corners.bottom_right,warp.corners.bottom_left].map(p=>({x:p.x*(width-1),y:p.y*(height-1)}));
  const src=[{x:0,y:0},{x:width-1,y:0},{x:width-1,y:height-1},{x:0,y:height-1}];
  const H=homography(dst,src),out=Buffer.alloc(width*height*channels);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const den=H[6]*x+H[7]*y+H[8]; if(Math.abs(den)<1e-10)continue;
    const sx=(H[0]*x+H[1]*y+H[2])/den,sy=(H[3]*x+H[4]*y+H[5])/den;
    const oi=(y*width+x)*channels;
    if(sx<0||sx>width-1||sy<0||sy>height-1){for(let c=0;c<channels;c++)out[oi+c]=0;continue;}
    for(let c=0;c<channels;c++)out[oi+c]=Math.round(sampleBilinear(raw,width,height,channels,sx,sy,c));
  }
  return {bytes:out,width,height,channels,warp,applied:true};
}
export const CreativeImageStudioPerspectiveWarpRuntime=Object.freeze({contract:CREATIVE_IMAGE_STUDIO_PERSPECTIVE_WARP_CONTRACT,normalize:normalizeImageStudioPerspectiveWarp,isIdentity:imageStudioPerspectiveWarpIsIdentity,cssPreview:imageStudioPerspectiveCssPreview,projectPoint:projectImageStudioPerspectivePoint,applyPixels:applyImageStudioPerspectiveWarp});
export default CreativeImageStudioPerspectiveWarpRuntime;
