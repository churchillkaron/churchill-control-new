export const CREATIVE_IMAGE_STUDIO_COLOR_GRADE_CONTRACT = "CREATIVE_IMAGE_STUDIO_COLOR_GRADE_V1";

export const IMAGE_STUDIO_COLOR_BALANCE_TONES=Object.freeze(["SHADOWS","MIDTONES","HIGHLIGHTS"]);
export const IMAGE_STUDIO_CHANNEL_MIXER_OUTPUTS=Object.freeze(["RED","GREEN","BLUE"]);
export const IMAGE_STUDIO_SELECTIVE_COLOR_RANGES=Object.freeze(["REDS","YELLOWS","GREENS","CYANS","BLUES","MAGENTAS","WHITES","NEUTRALS","BLACKS"]);

function n(v,f=0){const x=Number(v);return Number.isFinite(x)?x:f;}
function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function toneValue(value={}){return Object.freeze({cyan_red:clamp(n(value.cyan_red),-100,100),magenta_green:clamp(n(value.magenta_green),-100,100),yellow_blue:clamp(n(value.yellow_blue),-100,100)});}
function mixerValue(value={},identity={r:0,g:0,b:0}){return Object.freeze({r:clamp(n(value.r,identity.r),-200,200),g:clamp(n(value.g,identity.g),-200,200),b:clamp(n(value.b,identity.b),-200,200),constant:clamp(n(value.constant),-100,100)});}
function selectiveValue(value={}){return Object.freeze({cyan:clamp(n(value.cyan),-100,100),magenta:clamp(n(value.magenta),-100,100),yellow:clamp(n(value.yellow),-100,100),black:clamp(n(value.black),-100,100)});}

export function normalizeImageStudioColorGrade(value={}){
  const input=value&&typeof value==="object"?value:{};
  const balance=input.color_balance&&typeof input.color_balance==="object"?input.color_balance:{};
  const mixer=input.channel_mixer&&typeof input.channel_mixer==="object"?input.channel_mixer:{};
  const selective=input.selective_color&&typeof input.selective_color==="object"?input.selective_color:{};
  return Object.freeze({
    color_balance:Object.freeze(Object.fromEntries(IMAGE_STUDIO_COLOR_BALANCE_TONES.map((name)=>[name,toneValue(balance[name])]))),
    channel_mixer:Object.freeze({
      RED:mixerValue(mixer.RED,{r:100,g:0,b:0}),
      GREEN:mixerValue(mixer.GREEN,{r:0,g:100,b:0}),
      BLUE:mixerValue(mixer.BLUE,{r:0,g:0,b:100}),
      preserve_luminosity:mixer.preserve_luminosity!==false,
    }),
    selective_color:Object.freeze(Object.fromEntries(IMAGE_STUDIO_SELECTIVE_COLOR_RANGES.map((name)=>[name,selectiveValue(selective[name])]))),
  });
}

function luminance(r,g,b){return (.2126*r+.7152*g+.0722*b)/255;}
function balanceWeights(l){return {SHADOWS:Math.max(0,1-l*2),HIGHLIGHTS:Math.max(0,l*2-1),MIDTONES:Math.max(0,1-Math.abs(l-.5)*2)};}
function applyBalance(r,g,b,balance){
  const weights=balanceWeights(luminance(r,g,b));
  let rr=r,gg=g,bb=b;
  for(const tone of IMAGE_STUDIO_COLOR_BALANCE_TONES){
    const w=weights[tone],v=balance[tone];
    rr+=(v.cyan_red/100)*42*w;
    gg+=(v.magenta_green/100)*42*w;
    bb+=(v.yellow_blue/100)*42*w;
  }
  return [clamp(rr,0,255),clamp(gg,0,255),clamp(bb,0,255)];
}
function applyMixer(r,g,b,mixer){
  const source=[r,g,b],originalLum=luminance(r,g,b);
  const calc=(row)=>clamp(source[0]*(row.r/100)+source[1]*(row.g/100)+source[2]*(row.b/100)+(row.constant/100)*255,0,255);
  let rr=calc(mixer.RED),gg=calc(mixer.GREEN),bb=calc(mixer.BLUE);
  if(mixer.preserve_luminosity){
    const nextLum=Math.max(.001,luminance(rr,gg,bb));
    const scale=clamp(originalLum/nextLum,.25,4);
    rr=clamp(rr*scale,0,255);gg=clamp(gg*scale,0,255);bb=clamp(bb*scale,0,255);
  }
  return [rr,gg,bb];
}
function hueDistance(a,b){const d=Math.abs(a-b)%360;return Math.min(d,360-d);}
function hueFromRgb(r,g,b){
  const rn=r/255,gn=g/255,bn=b/255,max=Math.max(rn,gn,bn),min=Math.min(rn,gn,bn),d=max-min;
  if(d<1e-6)return {h:0,s:0,l:(max+min)/2};
  let h;if(max===rn)h=60*(((gn-bn)/d)%6);else if(max===gn)h=60*((bn-rn)/d+2);else h=60*((rn-gn)/d+4);
  if(h<0)h+=360;const l=(max+min)/2;const s=d/(1-Math.abs(2*l-1));
  return {h,s:Number.isFinite(s)?s:0,l};
}
const HUE_CENTERS={REDS:0,YELLOWS:60,GREENS:120,CYANS:180,BLUES:240,MAGENTAS:300};
function rangeWeight(name,r,g,b){
  const {h,s,l}=hueFromRgb(r,g,b);
  if(HUE_CENTERS[name]!=null)return clamp(1-hueDistance(h,HUE_CENTERS[name])/60,0,1)*s;
  if(name==="WHITES")return clamp((l-.65)/.35,0,1);
  if(name==="BLACKS")return clamp((.35-l)/.35,0,1);
  return clamp(1-Math.abs(l-.5)/.35,0,1)*(1-s*.35);
}
function applySelective(r,g,b,selective){
  let rr=r,gg=g,bb=b;
  const weights=Object.fromEntries(IMAGE_STUDIO_SELECTIVE_COLOR_RANGES.map((name)=>[name,rangeWeight(name,r,g,b)]));
  let blackScale=1;
  for(const name of IMAGE_STUDIO_SELECTIVE_COLOR_RANGES){
    const w=weights[name];if(w<=0)continue;
    const v=selective[name];
    rr+=(-v.cyan/100)*44*w;
    gg+=(-v.magenta/100)*44*w;
    bb+=(-v.yellow/100)*44*w;
    blackScale*=1-(v.black/100)*.28*w;
  }
  return [clamp(rr*blackScale,0,255),clamp(gg*blackScale,0,255),clamp(bb*blackScale,0,255)];
}

export function imageStudioColorGradeIsIdentity(value={}){
  const g=normalizeImageStudioColorGrade(value);
  const balanceIdentity=IMAGE_STUDIO_COLOR_BALANCE_TONES.every((name)=>Object.values(g.color_balance[name]).every((v)=>v===0));
  const expected={RED:{r:100,g:0,b:0,constant:0},GREEN:{r:0,g:100,b:0,constant:0},BLUE:{r:0,g:0,b:100,constant:0}};
  const mixerIdentity=IMAGE_STUDIO_CHANNEL_MIXER_OUTPUTS.every((name)=>Object.keys(expected[name]).every((key)=>g.channel_mixer[name][key]===expected[name][key]));
  const selectiveIdentity=IMAGE_STUDIO_SELECTIVE_COLOR_RANGES.every((name)=>Object.values(g.selective_color[name]).every((v)=>v===0));
  return balanceIdentity&&mixerIdentity&&selectiveIdentity;
}

export function applyImageStudioColorGrade(raw,width,height,channels,value={}){
  if(!Buffer.isBuffer(raw)&&!(raw instanceof Uint8Array))throw new Error("IMAGE_STUDIO_COLOR_GRADE_RAW_BUFFER_REQUIRED");
  if(channels<3)throw new Error("IMAGE_STUDIO_COLOR_GRADE_RGB_CHANNELS_REQUIRED");
  const grade=normalizeImageStudioColorGrade(value),out=Buffer.from(raw);
  for(let i=0;i<out.length;i+=channels){
    let [r,g,b]=applyBalance(out[i],out[i+1],out[i+2],grade.color_balance);
    [r,g,b]=applyMixer(r,g,b,grade.channel_mixer);
    [r,g,b]=applySelective(r,g,b,grade.selective_color);
    out[i]=Math.round(r);out[i+1]=Math.round(g);out[i+2]=Math.round(b);
  }
  return {bytes:out,width,height,channels,color_grade:grade};
}

export const CreativeImageStudioColorGradeRuntime=Object.freeze({contract:CREATIVE_IMAGE_STUDIO_COLOR_GRADE_CONTRACT,balance_tones:IMAGE_STUDIO_COLOR_BALANCE_TONES,mixer_outputs:IMAGE_STUDIO_CHANNEL_MIXER_OUTPUTS,selective_ranges:IMAGE_STUDIO_SELECTIVE_COLOR_RANGES,normalize:normalizeImageStudioColorGrade,isIdentity:imageStudioColorGradeIsIdentity,applyPixels:applyImageStudioColorGrade});
export default CreativeImageStudioColorGradeRuntime;
