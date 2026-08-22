import crypto from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveCreativeFfmpegPath, resolveCreativeFfprobePath } from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";
import { normalizeCreativeStillImage, creativeRawStillInputArgs } from "@/lib/creative/media/runtime/CreativeStillImageInputRuntime";

const CONTRACT = "AVANTIQO_INVESTOR_FILM_V10_SYNTHETIC_INTELLIGENCE_V5_VECTOR_TYPE";
const ORG = "33336a72-acb5-474e-856b-8be0269360e2";
const PROJECT = "37ca49f2-210d-4665-af6b-6b5fa834f750";
const BUCKET = "creative-assets";
const FPS = 24;
const INTRO_FRAMES = 192;
const V9_FRAMES = 5700;
const TARGET_FRAMES = 5892;
const TARGET_DURATION = 245.5;
const APPROVED_LOGO_FILM = `${ORG}/unassigned/df1cdd49-68e2-4a77-956e-6c9565c0074d-google-veo-6c9upygjkui2.mp4`;
const V9_MASTER = `${ORG}/${PROJECT}/spatial-master-v9/avantiqo-investor-film-v9-intelligence-237.5s.mp4`;
const OUTPUT_PATH = `${ORG}/${PROJECT}/spatial-master-v10/avantiqo-investor-film-v10-synthetic-intelligence-245.5s.mp4`;
const PREVIEW_PATH = `${ORG}/${PROJECT}/scene-previews-20260822/synthetic-intelligence-professional-v5.mp4`;
const X264_PARAMS = "threads=1:lookahead_threads=0:sync-lookahead=0:rc-lookahead=0:bframes=0";

const GLYPHS = Object.freeze({
  A:[[0,1,.5,0],[.5,0,1,1],[.2,.62,.8,.62]],
  B:[[0,0,0,1],[0,0,.72,0],[.72,0,.92,.18],[.92,.18,.72,.48],[.72,.48,0,.48],[.72,.48,.94,.66],[.94,.66,.74,1],[.74,1,0,1]],
  C:[[1,0,.15,0],[.15,0,0,.15],[0,.15,0,.85],[0,.85,.15,1],[.15,1,1,1]],
  E:[[1,0,0,0],[0,0,0,1],[0,1,1,1],[0,.5,.78,.5]],
  F:[[0,1,0,0],[0,0,1,0],[0,.5,.78,.5]],
  G:[[1,0,.15,0],[.15,0,0,.15],[0,.15,0,.85],[0,.85,.15,1],[.15,1,1,1],[1,1,1,.56],[1,.56,.58,.56]],
  H:[[0,0,0,1],[1,0,1,1],[0,.5,1,.5]],
  I:[[.15,0,.85,0],[.5,0,.5,1],[.15,1,.85,1]],
  L:[[0,0,0,1],[0,1,1,1]],
  N:[[0,1,0,0],[0,0,1,1],[1,1,1,0]],
  O:[[.15,0,.85,0],[.85,0,1,.15],[1,.15,1,.85],[1,.85,.85,1],[.85,1,.15,1],[.15,1,0,.85],[0,.85,0,.15],[0,.15,.15,0]],
  R:[[0,1,0,0],[0,0,.72,0],[.72,0,.94,.2],[.94,.2,.72,.5],[.72,.5,0,.5],[.52,.5,1,1]],
  S:[[1,0,.15,0],[.15,0,0,.15],[0,.15,.15,.48],[.15,.48,.85,.48],[.85,.48,1,.65],[1,.65,.85,1],[.85,1,0,1]],
  T:[[0,0,1,0],[.5,0,.5,1]],
  U:[[0,0,0,.82],[0,.82,.18,1],[.18,1,.82,1],[.82,1,1,.82],[1,.82,1,0]],
  Y:[[0,0,.5,.5],[1,0,.5,.5],[.5,.5,.5,1]],
});

function run(command,args,timeoutMs=760000){return new Promise((resolve,reject)=>{const child=spawn(command,args,{shell:false,stdio:["ignore","pipe","pipe"],env:{...process.env,OMP_NUM_THREADS:"1",OPENBLAS_NUM_THREADS:"1",MKL_NUM_THREADS:"1"}}),out=[],err=[];let settled=false;const timer=setTimeout(()=>{child.kill("SIGKILL");if(!settled){settled=true;reject(new Error("INVESTOR_V10_V5_MEDIA_TIMEOUT"));}},timeoutMs);child.stdout.on("data",c=>out.push(c));child.stderr.on("data",c=>err.push(c));child.on("error",e=>{clearTimeout(timer);if(!settled){settled=true;reject(e);}});child.on("close",code=>{clearTimeout(timer);if(settled)return;settled=true;const stdout=Buffer.concat(out).toString("utf8"),stderr=Buffer.concat(err).toString("utf8");if(code!==0)reject(new Error(stderr.slice(-18000)||`MEDIA_EXIT_${code}`));else resolve(stdout);});});}
async function exists(p){const d=p.slice(0,p.lastIndexOf("/")),n=p.slice(p.lastIndexOf("/")+1);const{data,error}=await supabaseAdmin.storage.from(BUCKET).list(d,{search:n,limit:10});if(error)throw error;return(data||[]).some(x=>x.name===n);}
async function signed(p,expires=21600){const{data,error}=await supabaseAdmin.storage.from(BUCKET).createSignedUrl(p,expires);if(error)throw error;if(!data?.signedUrl)throw new Error(`INVESTOR_V10_V5_SIGNED_URL_MISSING:${p}`);return data.signedUrl;}
async function probe(ffprobe,input,timeout=180000){const raw=await run(ffprobe,["-v","error","-count_frames","-show_entries","format=duration:stream=codec_type,codec_name,width,height,r_frame_rate,nb_read_frames,sample_rate,channels","-of","json",input],timeout);return JSON.parse(raw||"{}");}
async function sha256File(p){const h=crypto.createHash("sha256");for await(const c of createReadStream(p,{highWaterMark:1024*1024}))h.update(c);return h.digest("hex");}
function env(n){const v=process.env[n];if(!v)throw new Error(`INVESTOR_V10_V5_ENV_MISSING:${n}`);return v;}
async function upload(storagePath,localPath){const stat=await fs.stat(localPath),checksum=await sha256File(localPath),base=env("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/,""),key=env("SUPABASE_SERVICE_ROLE_KEY"),encoded=storagePath.split("/").map(encodeURIComponent).join("/");const response=await fetch(`${base}/storage/v1/object/${encodeURIComponent(BUCKET)}/${encoded}`,{method:"POST",headers:{Authorization:`Bearer ${key}`,apikey:key,"Content-Type":"video/mp4","Content-Length":String(stat.size),"Cache-Control":"max-age=3600","x-upsert":"true"},body:createReadStream(localPath,{highWaterMark:1024*1024}),duplex:"half",cache:"no-store"});if(!response.ok)throw new Error(`INVESTOR_V10_V5_UPLOAD_FAILED:${response.status}:${(await response.text().catch(()=>"")).slice(0,900)}`);return{bytes:stat.size,checksum,path:storagePath,signed_url:await signed(storagePath,86400)};}

function linePath(word,{x,y,height,tracking=0.34,space=0.65}){
  const glyphWidth=height*0.58,advance=glyphWidth*(1+tracking),spaceAdvance=glyphWidth*space;
  let cursor=x,body="";
  for(const char of word){if(char===" "){cursor+=spaceAdvance;continue;}const segs=GLYPHS[char]||[];for(const [x1,y1,x2,y2] of segs){body+=`M${(cursor+x1*glyphWidth).toFixed(1)} ${(y+y1*height).toFixed(1)} L${(cursor+x2*glyphWidth).toFixed(1)} ${(y+y2*height).toFixed(1)} `;}cursor+=advance;}
  return {d:body.trim(),width:cursor-x};
}

function titleSvg(){
  const main=linePath("SYNTHETIC INTELLIGENCE",{x:0,y:0,height:92,tracking:0.30,space:0.72});
  const sub=linePath("FOR BUSINESS",{x:0,y:0,height:29,tracking:0.42,space:0.78});
  const mx=(1920-main.width)/2,my=438,sx=(1920-sub.width)/2,sy=585;
  const m=linePath("SYNTHETIC INTELLIGENCE",{x:mx,y:my,height:92,tracking:0.30,space:0.72});
  const s=linePath("FOR BUSINESS",{x:sx,y:sy,height:29,tracking:0.42,space:0.78});
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">
  <defs>
    <linearGradient id="platinum" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="0.26" stop-color="#aeb5bd"/><stop offset="0.53" stop-color="#f5f7f8"/><stop offset="0.76" stop-color="#737b84"/><stop offset="1" stop-color="#dfe3e6"/></linearGradient>
    <radialGradient id="halo"><stop offset="0" stop-color="#e7ebef" stop-opacity="0.13"/><stop offset="0.48" stop-color="#c2c8ce" stop-opacity="0.025"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
  </defs>
  <ellipse cx="960" cy="520" rx="730" ry="310" fill="url(#halo)"/>
  <path d="${m.d}" transform="translate(5 7)" fill="none" stroke="#11161b" stroke-opacity="0.72" stroke-width="5.2" stroke-linecap="square" stroke-linejoin="miter"/>
  <path d="${m.d}" fill="none" stroke="url(#platinum)" stroke-width="3.1" stroke-linecap="square" stroke-linejoin="miter"/>
  <path d="${s.d}" fill="none" stroke="#d7dce0" stroke-opacity="0.82" stroke-width="1.7" stroke-linecap="square"/>
  <path d="M810 650 H1110" stroke="#d6a66a" stroke-opacity="0.34" stroke-width="1"/>
  </svg>`);
}

async function rawTitle(dir){return normalizeCreativeStillImage({svg_buffer:titleSvg(),output_directory:dir,name:"synthetic-intelligence-vector-title",width:1920,height:1080,fit:"fill"});}

async function renderIntro(ffmpeg,ffprobe,dir){
  const [logoUrl,title]=await Promise.all([signed(APPROVED_LOGO_FILM),rawTitle(dir)]),out=path.join(dir,"intro-v5.mp4");
  const filter=`[0:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1,fps=${FPS},eq=contrast=1.08:saturation=0.86:brightness=-0.035,vignette=PI/6,trim=end_frame=${INTRO_FRAMES},setpts=N/(${FPS}*TB)[base];[1:v]fade=t=in:st=1.05:d=0.75:alpha=1,fade=t=out:st=6.55:d=0.62:alpha=1[title];[base][title]overlay=x='3*sin(t*0.15)':y='2*sin(t*0.12)':enable='between(t,0.90,7.30)',fade=t=in:st=0:d=0.45,fade=t=out:st=7.68:d=0.30,format=yuv420p[v];[2:a]volume=0.09,afade=t=in:st=0:d=1.10,afade=t=out:st=7.05:d=0.75[a]`;
  await run(ffmpeg,["-y","-threads","1","-filter_threads","1","-filter_complex_threads","1","-stream_loop","-1","-i",logoUrl,...creativeRawStillInputArgs(title,{fps:FPS,loop:true}),"-f","lavfi","-i","sine=frequency=46:sample_rate=48000:duration=8","-filter_complex",filter,"-map","[v]","-map","[a]","-c:v","libx264","-threads","1","-x264-params",X264_PARAMS,"-preset","ultrafast","-crf","15","-pix_fmt","yuv420p","-r",String(FPS),"-frames:v",String(INTRO_FRAMES),"-c:a","aac","-b:a","224k","-ar","48000","-ac","2","-t","8","-movflags","+faststart",out],320000);
  const m=await probe(ffprobe,out),v=(m.streams||[]).find(s=>s.codec_type==="video"),a=(m.streams||[]).find(s=>s.codec_type==="audio");if(!v||!a)throw new Error("INVESTOR_V10_V5_INTRO_AV_REQUIRED");if(Number(v.nb_read_frames||0)!==INTRO_FRAMES)throw new Error(`INVESTOR_V10_V5_INTRO_FRAMES_INVALID:${v.nb_read_frames}`);return out;
}

async function validate(ffprobe,file){const m=await probe(ffprobe,file),v=(m.streams||[]).find(s=>s.codec_type==="video"),a=(m.streams||[]).find(s=>s.codec_type==="audio"),frames=Number(v?.nb_read_frames||0),duration=Number(m.format?.duration||0),rate=v?.r_frame_rate||v?.avg_frame_rate;if(!v||!a)throw new Error("INVESTOR_V10_V5_AV_REQUIRED");if(Number(v.width)!==1920||Number(v.height)!==1080)throw new Error(`INVESTOR_V10_V5_DIMENSIONS_INVALID:${v.width}x${v.height}`);if(rate!=="24/1")throw new Error(`INVESTOR_V10_V5_FPS_INVALID:${rate}`);if(frames!==TARGET_FRAMES)throw new Error(`INVESTOR_V10_V5_FRAMES_INVALID:${frames}`);if(Math.abs(duration-TARGET_DURATION)>0.12)throw new Error(`INVESTOR_V10_V5_DURATION_INVALID:${duration}`);return{width:1920,height:1080,frame_rate:rate,exact_frames:frames,duration_seconds:duration,video_codec:v.codec_name,audio_codec:a.codec_name};}

export const AvantiqoInvestorFilmSyntheticIntelligenceV10RuntimeV5=Object.freeze({
  CONTRACT,OUTPUT_PATH,PREVIEW_PATH,
  async status(){return{contract:CONTRACT,v9_ready:await exists(V9_MASTER),approved_logo_film_ready:await exists(APPROVED_LOGO_FILM),final_ready:await exists(OUTPUT_PATH),vector_typography:true,server_font_dependency:false,target_frames:TARGET_FRAMES,duration_seconds:TARGET_DURATION};},
  async render(){const ffmpeg=resolveCreativeFfmpegPath(),ffprobe=resolveCreativeFfprobePath();if(!ffmpeg||!ffprobe)throw new Error("INVESTOR_V10_V5_MEDIA_BINARY_NOT_READY");if(!(await exists(V9_MASTER)))throw new Error("INVESTOR_V10_V5_V9_MASTER_NOT_READY");if(!(await exists(APPROVED_LOGO_FILM)))throw new Error("INVESTOR_V10_V5_APPROVED_LOGO_FILM_NOT_READY");const dir=await fs.mkdtemp(path.join(os.tmpdir(),"avantiqo-v10-v5-"));try{const intro=await renderIntro(ffmpeg,ffprobe,dir);const preview=path.join(dir,"intro-preview.mp4");await run(ffmpeg,["-y","-i",intro,"-map","0:v:0","-map","0:a:0","-c","copy","-movflags","+faststart",preview],90000);const previewStored=await upload(PREVIEW_PATH,preview);const v9=await signed(V9_MASTER),out=path.join(dir,"final-v10-v5.mp4");const filter=`[0:v]fps=${FPS},trim=end_frame=${INTRO_FRAMES},setpts=PTS-STARTPTS[v0];[0:a]atrim=0:8,asetpts=PTS-STARTPTS,aresample=48000[a0];[1:v]fps=${FPS},trim=end_frame=${V9_FRAMES},setpts=PTS-STARTPTS[v1];[1:a]atrim=0:237.5,asetpts=PTS-STARTPTS,aresample=48000[a1];[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]`;await run(ffmpeg,["-y","-threads","1","-filter_threads","1","-filter_complex_threads","1","-i",intro,"-i",v9,"-filter_complex",filter,"-map","[v]","-map","[a]","-c:v","libx264","-threads","1","-x264-params",X264_PARAMS,"-preset","ultrafast","-crf","15","-pix_fmt","yuv420p","-r",String(FPS),"-frames:v",String(TARGET_FRAMES),"-c:a","aac","-b:a","256k","-ar","48000","-ac","2","-t",String(TARGET_DURATION),"-movflags","+faststart",out],760000);const technical_qc=await validate(ffprobe,out),stored=await upload(OUTPUT_PATH,out);return{success:true,contract:CONTRACT,status:"RENDERED_REVIEW_REQUIRED",...stored,preview:previewStored,technical_qc,guarantees:{approved_3d_logo_film_used:true,vector_typography:true,server_font_dependency:false,radar_diagram_used:false,image_generation_used:false,synthetic_product_ui_used:false}};}finally{await fs.rm(dir,{recursive:true,force:true}).catch(()=>{});}}
});
