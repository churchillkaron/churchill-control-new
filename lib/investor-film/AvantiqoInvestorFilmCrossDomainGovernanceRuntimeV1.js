import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import sharp from "sharp";

import { getServiceSupabase } from "@/lib/shared/supabase/service";
import { resolveCreativeFfmpegPath, resolveCreativeFfprobePath } from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";

const supabase = getServiceSupabase();
const CONTRACT = "AVANTIQO_INVESTOR_CROSS_DOMAIN_GOVERNANCE_V1";
const BUCKET = "creative-assets";
const ORG = "33336a72-acb5-474e-856b-8be0269360e2";
const FPS = 24;
const TARGET_FRAMES = 1174;
const TARGET_DURATION = TARGET_FRAMES / FPS;
const OUTPUT_PATH = `${ORG}/avantiqo-investor-film-20260821/cross-domain-governance-v1-1174f.mp4`;
const THREAD_ARGS = ["-threads","1","-filter_threads","1","-filter_complex_threads","1"];

const SOURCES = Object.freeze({
  founder: `${ORG}/avantiqo-investor-film-20260820/founder-v7/founder-mid-integration-synced-approved-v7.mp4`,
  restaurant: `${ORG}/unassigned/e1b2c387-2dda-4192-bb7a-3cea339e2293-gemini-32vbfjlubvh7.mp4`,
  kitchen: `${ORG}/unassigned/cbba2295-76c6-43ea-acf5-1511017cc63b-gemini-v24pbxy5sy1t.mp4`,
  procurement: `${ORG}/unassigned/eef84bd3-c208-4ed8-bba0-6088a9b67ef9-gemini-thgn4qnk6hof.mp4`,
  finance: `${ORG}/unassigned/701a4abb-3ed8-4460-99ef-d388d1ce1ffa-gemini-8yvpgxklek51.mp4`,
  people: `${ORG}/unassigned/97c0dbc3-5cd0-49f8-8121-1f85831ed2ab-gemini-fpkwe0jb7rex.mp4`,
  hotel: `${ORG}/unassigned/7c1d5a46-812f-4c68-9e4f-0162c0748360-gemini-hr90v0w9p4wc.mp4`,
  field: `${ORG}/unassigned/752d3d33-c62c-402c-8459-62b04a9e4010-gemini-urre56o4cv2u.mp4`,
  healthcare: `${ORG}/unassigned/9b34b515-b9e4-4772-b142-c4ab375ed5ba-gemini-zzz5upejcnut.mp4`,
  reveal: `${ORG}/unassigned/5a56a041-3f60-47ff-a67b-bb011db8874c-gemini-qwgea6koo5yg.mp4`,
});

const SCENES = Object.freeze([
  { id:"founder", source:"founder", frames:91, mode:"founder" },
  { id:"event", source:"restaurant", frames:164, mode:"event", title:"One business event. One operating chain.", subtitle:"A customer action is understood once, then reused everywhere it matters." },
  { id:"commercial", source:"restaurant", frames:122, mode:"domain", domain:"COMMERCIAL", detail:"Customer · order · demand signal" },
  { id:"operations", source:"kitchen", frames:122, mode:"domain", domain:"OPERATIONS", detail:"Work · queue · handoff · service state" },
  { id:"supply", source:"procurement", frames:122, mode:"domain", domain:"SUPPLY CHAIN", detail:"Stock impact · purchasing · receiving" },
  { id:"people", source:"people", frames:110, mode:"domain", domain:"PEOPLE", detail:"Responsibility · schedule · authority" },
  { id:"finance", source:"finance", frames:122, mode:"domain", domain:"FINANCE", detail:"Revenue · evidence · cash · ledger" },
  { id:"industry", source:"hotel", frames:144, mode:"industry" },
  { id:"governance", source:"reveal", frames:177, mode:"governance" },
]);
if (SCENES.reduce((n,s)=>n+s.frames,0)!==TARGET_FRAMES) throw new Error("CROSS_DOMAIN_TIMELINE_INVALID");

function esc(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");}
function run(cmd,args,timeout=330000){return new Promise((resolve,reject)=>{const p=spawn(cmd,args,{stdio:["ignore","pipe","pipe"],env:{...process.env,OMP_NUM_THREADS:"1"}});const out=[],err=[];const timer=setTimeout(()=>{p.kill("SIGKILL");reject(new Error("CROSS_DOMAIN_MEDIA_TIMEOUT"));},timeout);p.stdout.on("data",c=>out.push(c));p.stderr.on("data",c=>err.push(c));p.on("error",e=>{clearTimeout(timer);reject(e)});p.on("close",code=>{clearTimeout(timer);if(code)reject(new Error(Buffer.concat(err).toString("utf8").slice(-12000)));else resolve(Buffer.concat(out).toString("utf8"));});});}
async function exists(storagePath){const d=storagePath.split("/").slice(0,-1).join("/");const f=storagePath.split("/").at(-1);const {data,error}=await supabase.storage.from(BUCKET).list(d,{search:f,limit:10});return !error&&(data||[]).some(x=>x.name===f);}
async function signed(storagePath,seconds=7200){const {data,error}=await supabase.storage.from(BUCKET).createSignedUrl(storagePath,seconds);if(error)throw error;if(!data?.signedUrl)throw new Error(`SIGNED_URL_MISSING:${storagePath}`);return data.signedUrl;}
async function upload(local){const bytes=await fs.readFile(local);const checksum=crypto.createHash("sha256").update(bytes).digest("hex");const {error}=await supabase.storage.from(BUCKET).upload(OUTPUT_PATH,bytes,{contentType:"video/mp4",upsert:true,metadata:{contract:CONTRACT,exact_frames:TARGET_FRAMES,fps:FPS,chapter:"cross_domain_industry_governance"}});if(error)throw error;return{path:OUTPUT_PATH,bytes:bytes.length,checksum};}

function defs(){return `<defs><linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#07080a" stop-opacity=".92"/><stop offset="1" stop-color="#17120c" stop-opacity=".80"/></linearGradient><radialGradient id="halo"><stop offset="0" stop-color="#D6A66A" stop-opacity=".24"/><stop offset="1" stop-color="#D6A66A" stop-opacity="0"/></radialGradient></defs>`;}
function card(x,y,w,h,title,sub="",accent="#D6A66A"){return `<g transform="translate(${x} ${y})"><rect width="${w}" height="${h}" rx="16" fill="#fff" fill-opacity=".028" stroke="#fff" stroke-opacity=".08"/><rect width="3" height="${h}" rx="2" fill="${accent}"/><text x="20" y="27" fill="#F1EEE7" font-family="Arial" font-size="13" font-weight="700">${esc(title)}</text>${sub?`<text x="20" y="49" fill="#89857E" font-family="Arial" font-size="10">${esc(sub)}</text>`:""}</g>`;}
function header(title,subtitle){return `<text x="72" y="72" fill="#D6A66A" font-family="Arial" font-size="13" font-weight="700" letter-spacing="2.2">AVANTIQO · OPERATING INTELLIGENCE</text><text x="72" y="122" fill="#F7F4ED" font-family="Arial" font-size="34" font-weight="700">${esc(title)}</text><text x="72" y="154" fill="#A29F98" font-family="Arial" font-size="15">${esc(subtitle)}</text><rect x="72" y="181" width="816" height="1" fill="#D6A66A" fill-opacity=".35"/>`;}
function panel(s){if(s.mode==="founder")return null;let body="";let title=s.title||"The same truth moves across the company.";let subtitle=s.subtitle||"Different teams receive different work — without creating different realities.";
 if(s.mode==="event") body=`${card(74,224,246,72,"CUSTOMER ACTION","booking · order · request")}${card(357,224,246,72,"AVANTIQO CONTEXT","identity · intent · history")}${card(640,224,246,72,"BUSINESS EVENT","one accountable record")}<path d="M155 340 C300 430 660 430 805 340" fill="none" stroke="#D6A66A" stroke-opacity=".4" stroke-width="2"/><circle cx="480" cy="410" r="58" fill="url(#halo)"/><circle cx="480" cy="410" r="39" fill="#080806" stroke="#D6A66A" stroke-opacity=".6"/><text x="480" y="407" text-anchor="middle" fill="#fff" font-family="Arial" font-size="14" font-weight="700">ONE CONTEXT</text><text x="480" y="427" text-anchor="middle" fill="#D6A66A" font-family="Arial" font-size="9" font-weight="700">MANY CONSEQUENCES</text>`;
 if(s.mode==="domain"){title=`${s.domain} receives exactly what it needs.`;body=`<circle cx="480" cy="338" r="96" fill="url(#halo)"/><circle cx="480" cy="338" r="62" fill="#080806" stroke="#D6A66A" stroke-opacity=".55"/><text x="480" y="332" text-anchor="middle" fill="#F7F4EC" font-family="Arial" font-size="20" font-weight="700">${esc(s.domain)}</text><text x="480" y="358" text-anchor="middle" fill="#D6A66A" font-family="Arial" font-size="10" font-weight="700">${esc(s.detail)}</text>${card(115,430,225,52,"INPUT","shared business event")}${card(620,430,225,52,"OUTPUT","accountable domain action")}`;}
 if(s.mode==="industry"){title="Different industries. Same intelligence architecture.";subtitle="The operating context stays shared while workflows remain industry-specific.";body=`${card(72,226,190,92,"RESTAURANT","orders · service · stock")}${card(280,226,190,92,"HOTEL","guest · room · service")}${card(488,226,190,92,"FIELD SERVICE","dispatch · evidence · completion")}${card(696,226,190,92,"HEALTHCARE","coordination · accountability")}${card(176,365,608,72,"ONE OPERATING FOUNDATION","Context · permissions · evidence · workflow · intelligence")}`;}
 if(s.mode==="governance"){title="Autonomy is a business control — not an on/off switch.";subtitle="The organization decides how far Avantiqo may go for each action.";body=`${card(72,220,244,78,"ADVISE","recommend and explain","#8B8B84")}${card(358,220,244,78,"APPROVAL","prepare action, wait for authority","#D6A66A")}${card(644,220,244,78,"AUTONOMOUS","execute inside policy","#6FAE81")}<text x="480" y="352" text-anchor="middle" fill="#8F8C85" font-family="Arial" font-size="11" font-weight="700">EVERY ACTION REMAINS BOUNDED BY</text>${card(74,382,150,58,"AUTHORITY")}${card(238,382,150,58,"COST")}${card(402,382,150,58,"POLICY")}${card(566,382,150,58,"EVIDENCE")}${card(730,382,150,58,"AUDIT")}<text x="480" y="489" text-anchor="middle" fill="#D6A66A" font-family="Arial" font-size="15" font-weight="700">MORE AUTONOMY WHERE SAFE. MORE CONTROL WHERE IT MATTERS.</text>`;}
 return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540">${defs()}<rect x="20" y="20" width="920" height="500" rx="30" fill="url(#glass)" stroke="#D6A66A" stroke-opacity=".42"/>${header(title,subtitle)}${body}</svg>`);}
async function rawPanel(dir,s){const svg=panel(s);if(!svg)return null;const file=path.join(dir,`panel-${s.id}.rgba`);await fs.writeFile(file,await sharp(svg).ensureAlpha().raw().toBuffer());return file;}
function ease(a,b,from,to){const p=`(t-${a})/(${b}-${a})`;const e=`(${p}*${p}*(3-2*${p}))`;return `if(lt(t,${a}),${from},if(lt(t,${b}),${from}+(${to}-${from})*${e},${to}))`;}
async function renderScene(ffmpeg,url,panelRaw,s,out){const duration=s.frames/FPS;if(!panelRaw){await run(ffmpeg,["-y",...THREAD_ARGS,"-stream_loop","-1","-i",url,"-vf",`scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=${FPS},setsar=1`,"-an","-c:v","libx264","-preset","veryfast","-crf","17","-r",String(FPS),"-frames:v",String(s.frames),out]);return;}const riseA=.25,riseB=Math.min(1.25,duration*.28),fade=Math.max(riseB+.4,duration-.35);const w=ease(riseA,riseB,520,1540),h=ease(riseA,riseB,292,866),x=ease(riseA,riseB,1000,190),y=ease(riseA,riseB,640,108);const filter=`[0:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=${FPS},setsar=1,setpts=PTS-STARTPTS,eq=contrast=1.055:saturation=.80:brightness=-.025[base];[1:v]setpts=PTS-STARTPTS,format=rgba,fade=t=in:st=${riseA}:d=.22:alpha=1,fade=t=out:st=${fade}:d=.28:alpha=1,scale=w='${w}':h='${h}':eval=frame[p];[base][p]overlay=x='${x}':y='${y}':eval=frame,format=yuv420p[v]`;await run(ffmpeg,["-y",...THREAD_ARGS,"-stream_loop","-1","-i",url,"-stream_loop","-1","-f","rawvideo","-pixel_format","rgba","-video_size","960x540","-framerate",String(FPS),"-i",panelRaw,"-filter_complex",filter,"-map","[v]","-an","-c:v","libx264","-preset","veryfast","-crf","17","-r",String(FPS),"-frames:v",String(s.frames),out]);}
async function concat(ffmpeg,files,out){const args=["-y",...THREAD_ARGS];files.forEach(f=>args.push("-i",f));const reset=files.map((_,i)=>`[${i}:v]fps=${FPS},setpts=PTS-STARTPTS[v${i}]`).join(";");const ins=files.map((_,i)=>`[v${i}]`).join("");args.push("-filter_complex",`${reset};${ins}concat=n=${files.length}:v=1:a=0,format=yuv420p[v]`,"-map","[v]","-an","-c:v","libx264","-preset","veryfast","-crf","17","-r",String(FPS),"-frames:v",String(TARGET_FRAMES),out);await run(ffmpeg,args);}
async function probe(file){const p=resolveCreativeFfprobePath();const out=await run(p,["-v","error","-count_frames","-select_streams","v:0","-show_entries","stream=width,height,r_frame_rate,nb_read_frames:format=duration","-of","json",file],90000);return JSON.parse(out||"{}");}

export const AvantiqoInvestorFilmCrossDomainGovernanceRuntimeV1={CONTRACT,BUCKET,ORG,OUTPUT_PATH,FPS,TARGET_FRAMES,TARGET_DURATION,SCENES,
 async status(){const source_readiness={};for(const[k,v]of Object.entries(SOURCES))source_readiness[k]=await exists(v);return{contract:CONTRACT,ready:await exists(OUTPUT_PATH),output_path:OUTPUT_PATH,source_readiness,exact_frames:TARGET_FRAMES,duration_seconds:TARGET_DURATION,policies:{founder_lipsync_preserved:true,cross_domain_execution:true,industry_specific_workflows:true,autonomy_dial:true,governance_visible:true}};},
 async downloadUrl(seconds=86400){return await exists(OUTPUT_PATH)?signed(OUTPUT_PATH,seconds):null;},
 async render(){const ffmpeg=resolveCreativeFfmpegPath();if(!ffmpeg)throw new Error("FFMPEG_NOT_READY");const dir=await fs.mkdtemp(path.join(os.tmpdir(),"avq-cross-domain-"));try{const urls={};for(const[k,v]of Object.entries(SOURCES)){if(!(await exists(v)))throw new Error(`SOURCE_MISSING:${k}`);urls[k]=await signed(v);}const segments=[];for(let i=0;i<SCENES.length;i++){const s=SCENES[i];const p=await rawPanel(dir,s);const out=path.join(dir,`s-${i}.mp4`);await renderScene(ffmpeg,urls[s.source],p,s,out);segments.push(out);}const final=path.join(dir,"final.mp4");await concat(ffmpeg,segments,final);const media=await probe(final);const st=media?.streams?.[0]||{};const frames=Number(st.nb_read_frames||0);const duration=Number(media?.format?.duration||0);if(frames!==TARGET_FRAMES)throw new Error(`FRAME_COUNT_INVALID:${frames}`);if(Number(st.width)!==1920||Number(st.height)!==1080)throw new Error("DIMENSIONS_INVALID");if(st.r_frame_rate!=="24/1")throw new Error(`FPS_INVALID:${st.r_frame_rate}`);if(Math.abs(duration-TARGET_DURATION)>.08)throw new Error(`DURATION_INVALID:${duration}`);const stored=await upload(final);return{success:true,contract:CONTRACT,output:stored,signed_url:await signed(OUTPUT_PATH,86400),exact_frames:frames,duration_seconds:duration};}finally{await fs.rm(dir,{recursive:true,force:true}).catch(()=>{});}}
};
