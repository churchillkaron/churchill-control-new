export const CREATIVE_IMAGE_STUDIO_LOOK_CONTRACT = "CREATIVE_IMAGE_STUDIO_LOOK_V1";

export const IMAGE_STUDIO_LOOK_PRESETS=Object.freeze(["NEUTRAL","CINEMATIC_WARM","COOL_STEEL","TEAL_ORANGE","FADED_FILM","MONOCHROME"]);

function n(v,f=0){const x=Number(v);return Number.isFinite(x)?x:f;}
function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function hexToRgb(value,fallback="#000000"){const text=String(value||fallback).trim();const match=/^#([0-9a-f]{6})$/i.exec(text);const raw=(match?.[1]||fallback.replace("#",""));return [0,2,4].map((i)=>parseInt(raw.slice(i,i+2),16));}
function rgbToHex(rgb){return "#"+rgb.map((v)=>Math.round(clamp(v,0,255)).toString(16).padStart(2,"0")).join("");}
function mix(a,b,t){return a+(b-a)*clamp(t,0,1);}
function luminance(r,g,b){return clamp((.2126*r+.7152*g+.0722*b)/255,0,1);}
function normalizeStops(stops=[]){
  const source=Array.isArray(stops)?stops:[];
  const rows=source.map((stop)=>({position:clamp(n(stop?.position),0,1),color:rgbToHex(hexToRgb(stop?.color,"#000000"))})).sort((a,b)=>a.position-b.position);
  if(!rows.length)return Object.freeze([{position:0,color:"#000000"},{position:1,color:"#ffffff"}]);
  if(rows[0].position>0)rows.unshift({position:0,color:rows[0].color});
  if(rows.at(-1).position<1)rows.push({position:1,color:rows.at(-1).color});
  return Object.freeze(rows);
}
function sampleGradient(stops,l){
  let i=0;while(i<stops.length-2&&l>stops[i+1].position)i++;
  const a=stops[i],b=stops[Math.min(i+1,stops.length-1)];
  const span=Math.max(.000001,b.position-a.position),t=clamp((l-a.position)/span,0,1);
  const ar=hexToRgb(a.color),br=hexToRgb(b.color);
  return ar.map((v,c)=>mix(v,br[c],t));
}
function preset(value){
  const name=IMAGE_STUDIO_LOOK_PRESETS.includes(String(value||"NEUTRAL").toUpperCase())?String(value||"NEUTRAL").toUpperCase():"NEUTRAL";
  const table={
    NEUTRAL:{matrix:[[1,0,0],[0,1,0],[0,0,1]],lift:[0,0,0],gain:[1,1,1],sat:1},
    CINEMATIC_WARM:{matrix:[[1.04,.02,-.02],[.01,1,.0],[-.03,.01,.97]],lift:[3,1,-3],gain:[1.03,1.0,.96],sat:1.03},
    COOL_STEEL:{matrix:[[.97,.01,.02],[0,1,.02],[.01,.02,1.05]],lift:[-2,0,4],gain:[.97,1,1.04],sat:.92},
    TEAL_ORANGE:{matrix:[[1.06,.01,-.04],[0,1.0,.01],[-.03,.04,1.03]],lift:[0,3,4],gain:[1.05,1,.96],sat:1.08},
    FADED_FILM:{matrix:[[1,.01,0],[.01,.99,0],[.01,.01,.97]],lift:[12,10,9],gain:[.94,.93,.91],sat:.86},
    MONOCHROME:{matrix:[[.2126,.7152,.0722],[.2126,.7152,.0722],[.2126,.7152,.0722]],lift:[0,0,0],gain:[1,1,1],sat:0},
  };
  return {name,...table[name]};
}
function applyPreset(r,g,b,definition,strength){
  const input=[r,g,b],matrix=definition.matrix;
  let out=matrix.map((row,c)=>row.reduce((sum,k,i)=>sum+k*input[i],0)*definition.gain[c]+definition.lift[c]);
  if(definition.sat!==1){
    const l=.2126*out[0]+.7152*out[1]+.0722*out[2];
    out=out.map((v)=>l+(v-l)*definition.sat);
  }
  return out.map((v,i)=>mix(input[i],clamp(v,0,255),strength));
}
export function normalizeImageStudioLook(value={}){
  const input=value&&typeof value==="object"?value:{};
  const gradient=input.gradient_map&&typeof input.gradient_map==="object"?input.gradient_map:{};
  const split=input.split_toning&&typeof input.split_toning==="object"?input.split_toning:{};
  const creative=input.creative_look&&typeof input.creative_look==="object"?input.creative_look:{};
  return Object.freeze({
    gradient_map:Object.freeze({enabled:gradient.enabled===true,strength:clamp(n(gradient.strength,0),0,1),stops:normalizeStops(gradient.stops)}),
    split_toning:Object.freeze({enabled:split.enabled===true,shadow_color:rgbToHex(hexToRgb(split.shadow_color,"#24405c")),highlight_color:rgbToHex(hexToRgb(split.highlight_color,"#f4c38a")),balance:clamp(n(split.balance,0),-1,1),strength:clamp(n(split.strength,0),0,1)}),
    creative_look:Object.freeze({preset:preset(creative.preset).name,strength:clamp(n(creative.strength,0),0,1)}),
  });
}
export function imageStudioLookIsIdentity(value={}){
  const look=normalizeImageStudioLook(value);
  return (!look.gradient_map.enabled||look.gradient_map.strength===0)&&(!look.split_toning.enabled||look.split_toning.strength===0)&&(look.creative_look.preset==="NEUTRAL"||look.creative_look.strength===0);
}
function applySplit(r,g,b,split){
  if(!split.enabled||split.strength<=0)return [r,g,b];
  const l=luminance(r,g,b),pivot=clamp(.5+split.balance*.3,.1,.9);
  const shadowWeight=clamp((pivot-l)/Math.max(.001,pivot),0,1);
  const highlightWeight=clamp((l-pivot)/Math.max(.001,1-pivot),0,1);
  const sc=hexToRgb(split.shadow_color),hc=hexToRgb(split.highlight_color);
  const neutralWeight=1-shadowWeight-highlightWeight;
  const target=[0,1,2].map((i)=>r*(i===0?neutralWeight:0));
  const base=[r,g,b];
  return base.map((v,i)=>{
    const colored=mix(v,sc[i],shadowWeight*.55)+ (hc[i]-v)*highlightWeight*.55;
    return clamp(mix(v,colored,split.strength),0,255);
  });
}
export function applyImageStudioLook(raw,width,height,channels,value={}){
  if(!Buffer.isBuffer(raw)&&!(raw instanceof Uint8Array))throw new Error("IMAGE_STUDIO_LOOK_RAW_BUFFER_REQUIRED");
  if(channels<3)throw new Error("IMAGE_STUDIO_LOOK_RGB_CHANNELS_REQUIRED");
  const look=normalizeImageStudioLook(value),definition=preset(look.creative_look.preset),out=Buffer.from(raw);
  for(let i=0;i<out.length;i+=channels){
    const original=[out[i],out[i+1],out[i+2]];let [r,g,b]=original;
    if(look.gradient_map.enabled&&look.gradient_map.strength>0){
      const mapped=sampleGradient(look.gradient_map.stops,luminance(r,g,b));
      r=mix(r,mapped[0],look.gradient_map.strength);g=mix(g,mapped[1],look.gradient_map.strength);b=mix(b,mapped[2],look.gradient_map.strength);
    }
    [r,g,b]=applySplit(r,g,b,look.split_toning);
    if(look.creative_look.strength>0)[r,g,b]=applyPreset(r,g,b,definition,look.creative_look.strength);
    out[i]=Math.round(clamp(r,0,255));out[i+1]=Math.round(clamp(g,0,255));out[i+2]=Math.round(clamp(b,0,255));
  }
  return {bytes:out,width,height,channels,look};
}
export const CreativeImageStudioLookRuntime=Object.freeze({contract:CREATIVE_IMAGE_STUDIO_LOOK_CONTRACT,presets:IMAGE_STUDIO_LOOK_PRESETS,normalize:normalizeImageStudioLook,isIdentity:imageStudioLookIsIdentity,applyPixels:applyImageStudioLook});
export default CreativeImageStudioLookRuntime;
