function n(v,f=0){const x=Number(v);return Number.isFinite(x)?x:f;}
function clamp(v,min,max){return Math.max(min,Math.min(max,v));}

export function normalizeImageStudioTextureIntegration(style={}){
  const t=style.texture_integration&&typeof style.texture_integration==="object"?style.texture_integration:{};
  return Object.freeze({
    sharpen_sigma:clamp(n(t.sharpen_sigma,0),0,5),
    grain_amount:clamp(n(t.grain_amount,0),0,.35),
    grain_size:clamp(Math.round(n(t.grain_size,1)),1,6),
    grain_seed:Math.trunc(n(t.grain_seed,1337))|0,
    grain_monochrome:t.grain_monochrome!==false,
    bloom_strength:clamp(n(t.bloom_strength,0),0,1),
    bloom_radius_px:clamp(n(t.bloom_radius_px,18),0,120),
    bloom_threshold:clamp(n(t.bloom_threshold,.78),0,1),
  });
}

function xorshift32(seed){
  let state=(seed|0)||0x6d2b79f5;
  return ()=>{
    state^=state<<13;state^=state>>>17;state^=state<<5;
    return (state>>>0)/4294967295;
  };
}

export function buildImageStudioGrainPixels(style={},size=1024){
  const settings=normalizeImageStudioTextureIntegration(style);
  const tileSize=Math.max(64,Math.min(2048,Math.round(size)));
  const pixels=new Uint8ClampedArray(tileSize*tileSize*4);
  if(settings.grain_amount<=0)return {pixels,width:tileSize,height:tileSize,channels:4,settings};
  const random=xorshift32(settings.grain_seed);
  const block=settings.grain_size;
  for(let by=0;by<tileSize;by+=block)for(let bx=0;bx<tileSize;bx+=block){
    const mono=Math.round(128+(random()-.5)*112);
    const values=settings.grain_monochrome
      ?[mono,mono,mono]
      :[Math.round(128+(random()-.5)*112),Math.round(128+(random()-.5)*112),Math.round(128+(random()-.5)*112)];
    for(let y=by;y<Math.min(tileSize,by+block);y++)for(let x=bx;x<Math.min(tileSize,bx+block);x++){
      const i=(y*tileSize+x)*4;
      pixels[i]=values[0];pixels[i+1]=values[1];pixels[i+2]=values[2];
      pixels[i+3]=Math.round(settings.grain_amount*255);
    }
  }
  return {pixels,width:tileSize,height:tileSize,channels:4,settings};
}

export const CreativeImageStudioTextureCoreRuntime=Object.freeze({
  normalize:normalizeImageStudioTextureIntegration,
  buildGrainPixels:buildImageStudioGrainPixels,
});
export default CreativeImageStudioTextureCoreRuntime;
