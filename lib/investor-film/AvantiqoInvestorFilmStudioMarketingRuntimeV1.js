import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import sharp from "sharp";

import { getServiceSupabase } from "@/lib/shared/supabase/service";
import { resolveCreativeFfmpegPath, resolveCreativeFfprobePath } from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";

const supabase = getServiceSupabase();
const CONTRACT = "AVANTIQO_INVESTOR_STUDIO_MARKETING_CINEMA_V1";
const BUCKET = "creative-assets";
const ORG = "33336a72-acb5-474e-856b-8be0269360e2";
const FPS = 24;
const TARGET_FRAMES = 881;
const TARGET_DURATION = TARGET_FRAMES / FPS;
const OUTPUT_PATH = `${ORG}/avantiqo-investor-film-20260821/studio-marketing-cinema-v1-881f.mp4`;
const THREAD_ARGS = ["-threads","1","-filter_threads","1","-filter_complex_threads","1"];

const SOURCES = Object.freeze({
  manager: `${ORG}/unassigned/b1f518b9-e1da-4153-a665-93d1768b42f3-gemini-5sts8qv981mh.mp4`,
  reveal: `${ORG}/unassigned/5a56a041-3f60-47ff-a67b-bb011db8874c-gemini-qwgea6koo5yg.mp4`,
  restaurant: `${ORG}/unassigned/8ad5ac7b-2db9-46a3-8ecf-65e7a7d134a7-gemini-qv0auqgaxcyl.mp4`,
  finance: `${ORG}/unassigned/701a4abb-3ed8-4460-99ef-d388d1ce1ffa-gemini-8yvpgxklek51.mp4`,
});

const SCENES = Object.freeze([
  {id:"objective", source:"manager", frames:118, eyebrow:"BUSINESS OBJECTIVE", title:"Start with the outcome.", subtitle:"Launch a premium campaign that grows qualified demand without sacrificing margin.", mode:"objective"},
  {id:"studio", source:"reveal", frames:174, eyebrow:"CREATIVE STUDIO", title:"Strategy before generation.", subtitle:"Avantiqo turns business context into competing creative territories — not a prompt box.", mode:"studio"},
  {id:"production", source:"restaurant", frames:156, eyebrow:"SPECIALIST PRODUCTION", title:"One campaign universe. Every format.", subtitle:"Hero film, short ads, social, stills, landing pages, email, voice and music remain one governed creative system.", mode:"production"},
  {id:"marketing", source:"manager", frames:176, eyebrow:"AUTONOMOUS MARKETING", title:"Avantiqo decides how the campaign should move.", subtitle:"Audience, geography, channel, timing, budget, bidding, creative and destination are reasoned from real business readiness.", mode:"marketing"},
  {id:"launch", source:"restaurant", frames:132, eyebrow:"LAUNCH", title:"Approve once. Execute everywhere allowed.", subtitle:"The campaign activates through connected channels while spend and authority remain governed.", mode:"launch"},
  {id:"learn", source:"finance", frames:125, eyebrow:"CLOSED LOOP", title:"Results change the next decision.", subtitle:"Performance flows back into Avantiqo so creative, audience, timing and spend can adapt instead of resetting every campaign.", mode:"learn"},
]);
if (SCENES.reduce((n,s)=>n+s.frames,0)!==TARGET_FRAMES) throw new Error("STUDIO_MARKETING_TIMELINE_INVALID");

const AI = [
  ["OpenAI","#111111","#fff"],["Claude","#D97757","#fff"],["Gemini","#6D5DFB","#fff"],["Flux","#F2D24B","#111"],
  ["Veo","#4285F4","#fff"],["Runway","#fff","#111"],["Seedance","#171717","#fff"],["ElevenLabs","#fff","#111"],
];
const CHANNELS = [
  ["Meta","#1877F2"],["Instagram","#D62976"],["Google Ads","#4285F4"],["TikTok","#111111"],["YouTube","#FF0000"],["LinkedIn","#0A66C2"],
];

function esc(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");}
function run(cmd,args,timeout=330000){return new Promise((resolve,reject)=>{const p=spawn(cmd,args,{stdio:["ignore","pipe","pipe"],env:{...process.env,OMP_NUM_THREADS:"1"}});const out=[],err=[];const timer=setTimeout(()=>{p.kill("SIGKILL");reject(new Error("STUDIO_MARKETING_MEDIA_TIMEOUT"));},timeout);p.stdout.on("data",c=>out.push(c));p.stderr.on("data",c=>err.push(c));p.on("error",e=>{clearTimeout(timer);reject(e)});p.on("close",code=>{clearTimeout(timer);if(code)reject(new Error(Buffer.concat(err).toString("utf8").slice(-12000)));else resolve(Buffer.concat(out).toString("utf8"));});});}
async function exists(storagePath){const d=storagePath.split("/").slice(0,-1).join("/");const f=storagePath.split("/").at(-1);const {data,error}=await supabase.storage.from(BUCKET).list(d,{search:f,limit:10});return !error&&(data||[]).some(x=>x.name===f);}
async function signed(storagePath,seconds=7200){const {data,error}=await supabase.storage.from(BUCKET).createSignedUrl(storagePath,seconds);if(error)throw error;return data.signedUrl;}

function defs(){return `<defs><linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#08090b" stop-opacity=".92"/><stop offset="1" stop-color="#16120c" stop-opacity=".78"/></linearGradient><radialGradient id="halo"><stop offset="0" stop-color="#D6A66A" stop-opacity=".20"/><stop offset="1" stop-color="#D6A66A" stop-opacity="0"/></radialGradient></defs>`;}
function header(s){return `<text x="70" y="70" fill="#D6A66A" font-family="Arial" font-size="13" font-weight="700" letter-spacing="2.2">AVANTIQO · ${esc(s.eyebrow)}</text><text x="70" y="120" fill="#F7F4ED" font-family="Arial" font-size="35" font-weight="700">${esc(s.title)}</text><text x="70" y="153" fill="#A5A29B" font-family="Arial" font-size="15">${esc(s.subtitle)}</text><rect x="70" y="177" width="820" height="1" fill="#D6A66A" fill-opacity=".35"/>`;}
function card(x,y,w,h,title,sub,accent="#D6A66A"){return `<g transform="translate(${x} ${y})"><rect width="${w}" height="${h}" rx="16" fill="#fff" fill-opacity=".03" stroke="#fff" stroke-opacity=".08"/><rect x="0" y="0" width="3" height="${h}" rx="2" fill="${accent}"/><text x="20" y="28" fill="#EEECE6" font-family="Arial" font-size="13" font-weight="700">${esc(title)}</text><text x="20" y="50" fill="#85827B" font-family="Arial" font-size="10">${esc(sub)}</text></g>`;}
function body(s){
 if(s.mode==="objective") return `<rect x="72" y="220" width="816" height="215" rx="25" fill="#fff" fill-opacity=".025" stroke="#D6A66A" stroke-opacity=".18"/><text x="108" y="267" fill="#88857F" font-family="Arial" font-size="11" font-weight="700" letter-spacing="2">OUTCOME CONTRACT</text><text x="108" y="322" fill="#F8F5EE" font-family="Arial" font-size="29" font-weight="700">GROW QUALIFIED DEMAND</text><text x="108" y="358" fill="#D6A66A" font-family="Arial" font-size="20" font-weight="700">protect margin · preserve brand · stay within budget</text>${card(108,382,188,38,"30 DAYS","finite campaign")}${card(310,382,188,38,"SEA","target market")}${card(512,382,188,38,"PREMIUM","brand position")}`;
 if(s.mode==="studio") return `${card(72,220,244,86,"TERRITORY 01 · STATUS","Bold, scarce, aspirational")}${card(358,220,244,86,"TERRITORY 02 · CRAFT","Process, detail, provenance")}${card(644,220,244,86,"TERRITORY 03 · HUMAN","Emotion, identity, belonging")}<circle cx="480" cy="392" r="68" fill="url(#halo)"/><circle cx="480" cy="392" r="46" fill="#0a0907" stroke="#D6A66A" stroke-opacity=".55"/><text x="480" y="388" text-anchor="middle" fill="#F6F2EA" font-family="Arial" font-size="16" font-weight="700">AVANTIQO</text><text x="480" y="409" text-anchor="middle" fill="#D6A66A" font-family="Arial" font-size="9" font-weight="700">SELECTS THE STRONGEST WORLD</text><text x="480" y="490" text-anchor="middle" fill="#8F8B83" font-family="Arial" font-size="11">Audience fit · brand fit · commercial objective · production feasibility · cost</text>`;
 if(s.mode==="production"){const formats=["HERO FILM","15s","6s","SOCIAL","STILLS","LANDING","EMAIL","VOICE","MUSIC"];return formats.map((f,i)=>card(70+(i%3)*276,210+Math.floor(i/3)*82,244,62,f,"one campaign universe")).join("")+AI.map((a,i)=>`<g transform="translate(${78+i*100} 468)"><rect width="88" height="30" rx="10" fill="${a[1]}"/><text x="44" y="20" text-anchor="middle" fill="${a[2]}" font-family="Arial" font-size="10" font-weight="700">${a[0]}</text></g>`).join("");}
 if(s.mode==="marketing") return `${card(72,214,250,70,"AUDIENCE","who should see it")}${card(354,214,250,70,"GEOGRAPHY","where demand matters")}${card(636,214,250,70,"BUDGET + BIDDING","how hard to push")}${card(72,310,250,70,"CHANNEL","where to activate")}${card(354,310,250,70,"TIMING","when to move")}${card(636,310,250,70,"DESTINATION","where to convert")}<rect x="72" y="414" width="814" height="60" rx="18" fill="#D6A66A" fill-opacity=".075" stroke="#D6A66A" stroke-opacity=".24"/><text x="100" y="447" fill="#F5F1E8" font-family="Arial" font-size="16" font-weight="700">AI plans. Business readiness constrains. Owner authority governs.</text>`;
 if(s.mode==="launch") return CHANNELS.map((c,i)=>`<g transform="translate(${78+i*136} 236)"><rect width="120" height="48" rx="14" fill="${c[1]}"/><text x="60" y="30" text-anchor="middle" fill="#fff" font-family="Arial" font-size="11" font-weight="700">${c[0]}</text></g>`).join("")+`<path d="M130 330 C280 400 680 400 830 330" fill="none" stroke="#D6A66A" stroke-opacity=".4" stroke-width="2"/><circle cx="480" cy="390" r="58" fill="url(#halo)"/><circle cx="480" cy="390" r="39" fill="#080806" stroke="#D6A66A" stroke-opacity=".6"/><text x="480" y="387" text-anchor="middle" fill="#fff" font-family="Arial" font-size="13" font-weight="700">LAUNCH</text><text x="480" y="406" text-anchor="middle" fill="#D6A66A" font-family="Arial" font-size="9" font-weight="700">GOVERNED EXECUTION</text>`;
 return `${card(72,225,246,72,"CREATIVE","which world wins")}${card(356,225,246,72,"AUDIENCE","who responds")}${card(640,225,246,72,"ECONOMICS","what creates value")}<path d="M160 350 C290 460 670 460 800 350" fill="none" stroke="#D6A66A" stroke-opacity=".35" stroke-width="2"/><circle cx="480" cy="412" r="55" fill="url(#halo)"/><circle cx="480" cy="412" r="38" fill="#080806" stroke="#D6A66A" stroke-opacity=".55"/><text x="480" y="407" text-anchor="middle" fill="#fff" font-family="Arial" font-size="13" font-weight="700">LEARN</text><text x="480" y="426" text-anchor="middle" fill="#D6A66A" font-family="Arial" font-size="8" font-weight="700">NEXT BEST ACTION</text>`;
}
function svg(s){return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540">${defs()}<rect x="20" y="20" width="920" height="500" rx="30" fill="url(#glass)" stroke="#D6A66A" stroke-opacity=".38"/>${header(s)}${body(s)}</svg>`);}
async function panel(dir,s){const target=path.join(dir,`${s.id}.rgba`);await fs.writeFile(target,await sharp(svg(s)).ensureAlpha().raw().toBuffer());return target;}
async function renderScene(ffmpeg,url,panelRaw,s,out){const duration=s.frames/FPS;await run(ffmpeg,["-y",...THREAD_ARGS,"-stream_loop","-1","-i",url,"-stream_loop","-1","-f","rawvideo","-pixel_format","rgba","-video_size","960x540","-framerate",String(FPS),"-i",panelRaw,"-filter_complex",`[0:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=${FPS},eq=contrast=1.06:saturation=.78:brightness=-.03[bg];[bg]drawbox=x=0:y=0:w=1920:h=1080:color=black@.18:t=fill[g];[1:v]format=rgba,scale=1560:878,fade=t=in:st=.25:d=.35:alpha=1,fade=t=out:st=${Math.max(.6,duration-.4)}:d=.3:alpha=1[p];[g][p]overlay=x=180:y=101:shortest=0,format=yuv420p[v]`,"-map","[v]","-an","-c:v","libx264","-preset","veryfast","-crf","17","-r",String(FPS),"-frames:v",String(s.frames),out]);}
async function concat(ffmpeg,files,out){const args=["-y",...THREAD_ARGS];files.forEach(f=>args.push("-i",f));const reset=files.map((_,i)=>`[${i}:v]fps=${FPS},setpts=PTS-STARTPTS[v${i}]`).join(";");const ins=files.map((_,i)=>`[v${i}]`).join("");args.push("-filter_complex",`${reset};${ins}concat=n=${files.length}:v=1:a=0,format=yuv420p[v]`,`-map`,`[v]`,`-an`,`-c:v`,`libx264`,`-preset`,`veryfast`,`-crf`,`17`,`-r`,String(FPS),`-frames:v`,String(TARGET_FRAMES),out);await run(ffmpeg,args);}
async function probe(file){const ffprobe=resolveCreativeFfprobePath();const stdout=await run(ffprobe,["-v","error","-count_frames","-select_streams","v:0","-show_entries","stream=width,height,r_frame_rate,nb_read_frames:format=duration","-of","json",file],90000);return JSON.parse(stdout||"{}");}
async function upload(file){const bytes=await fs.readFile(file);const checksum=crypto.createHash("sha256").update(bytes).digest("hex");const {error}=await supabase.storage.from(BUCKET).upload(OUTPUT_PATH,bytes,{contentType:"video/mp4",upsert:true,metadata:{contract:CONTRACT,exact_frames:TARGET_FRAMES,fps:FPS,chapter:"STUDIO_MARKETING",visual_language:"OBSIDIAN_GOLD_BRAND_COLOR_ENDPOINTS"}});if(error)throw error;return{path:OUTPUT_PATH,bytes:bytes.length,checksum};}

export const AvantiqoInvestorFilmStudioMarketingRuntimeV1={
 CONTRACT,OUTPUT_PATH,FPS,TARGET_FRAMES,TARGET_DURATION,SCENES,
 async status(){const source_readiness={};for(const[k,v]of Object.entries(SOURCES))source_readiness[k]=await exists(v);return{contract:CONTRACT,ready:await exists(OUTPUT_PATH),output_path:OUTPUT_PATH,source_readiness,exact_frames:TARGET_FRAMES,duration_seconds:TARGET_DURATION,chapters:["objective","creative_strategy","specialist_production","autonomous_marketing","launch","learning"],policies:{prompt_box_visual:false,dashboard_slideshow:false,authentic_business_context:true,owner_authority_governs_paid_activation:true}};},
 async downloadUrl(seconds=86400){return await exists(OUTPUT_PATH)?signed(OUTPUT_PATH,seconds):null;},
 async render(){const ffmpeg=resolveCreativeFfmpegPath();if(!ffmpeg)throw new Error("STUDIO_MARKETING_FFMPEG_NOT_READY");const dir=await fs.mkdtemp(path.join(os.tmpdir(),"avq-studio-marketing-v1-"));try{const urls={};for(const[k,v]of Object.entries(SOURCES)){if(!(await exists(v)))throw new Error(`STUDIO_MARKETING_SOURCE_MISSING:${k}`);urls[k]=await signed(v);}const segments=[];for(let i=0;i<SCENES.length;i++){const s=SCENES[i];const raw=await panel(dir,s);const out=path.join(dir,`scene-${i+1}.mp4`);await renderScene(ffmpeg,urls[s.source],raw,s,out);segments.push(out);}const final=path.join(dir,"studio-marketing-v1.mp4");await concat(ffmpeg,segments,final);const media=await probe(final);const stream=media.streams?.[0]||{};const frames=Number(stream.nb_read_frames||0);if(frames!==TARGET_FRAMES)throw new Error(`STUDIO_MARKETING_FRAME_COUNT_INVALID:${frames}`);const stored=await upload(final);return{success:true,contract:CONTRACT,output:stored,signed_url:await signed(OUTPUT_PATH,86400),exact_frames:frames,duration_seconds:Number(media.format?.duration||0),frame_rate:stream.r_frame_rate,width:Number(stream.width),height:Number(stream.height)};}finally{await fs.rm(dir,{recursive:true,force:true}).catch(()=>{});}}
};
