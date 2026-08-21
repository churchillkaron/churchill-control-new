export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 800;

import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveCreativeFfmpegPath, resolveCreativeFfprobePath } from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";

const TOKEN = "avq-investor-spatial-master-v4-20260821";
const ORG = "33336a72-acb5-474e-856b-8be0269360e2";
const PROJECT = "37ca49f2-210d-4665-af6b-6b5fa834f750";
const BUCKET = "creative-assets";
const UNIT = 19.125;
const MASTER = 237.5;
const BODY_ROOT = `${ORG}/${PROJECT}/spatial-master-v2/units`;
const ROOT = `${ORG}/${PROJECT}/spatial-master-v4`;
const FINAL_PATH = `${ROOT}/avantiqo-investor-film-spatial-master-v4.mp4`;
const CHUNKS = [
  { index: 1, logo: true, units: [1,2,3], duration: 65.375 },
  { index: 2, logo: false, units: [4,5,6], duration: 57.375 },
  { index: 3, logo: false, units: [7,8,9], duration: 57.375 },
  { index: 4, logo: false, units: [10,11,12], duration: 57.375 },
];

const chunkPath = (index) => `${ROOT}/chunks/chunk-${index}.mp4`;
const unitPath = (index) => `${BODY_ROOT}/unit-${String(index).padStart(2,"0")}.mp4`;
const json = (data,status=200) => Response.json(data,{status,headers:{"Cache-Control":"no-store, private"}});

function run(command,args,timeoutMs=420000){
  return new Promise((resolve,reject)=>{
    const child=spawn(command,args,{shell:false,stdio:["ignore","ignore","pipe"],env:{...process.env,OMP_NUM_THREADS:"1"}});
    const stderr=[];let settled=false;
    const timer=setTimeout(()=>{child.kill("SIGKILL");if(!settled){settled=true;reject(new Error("SPATIAL_MASTER_V4_TIMEOUT"));}},timeoutMs);
    child.stderr.on("data",c=>stderr.push(c));
    child.on("error",e=>{clearTimeout(timer);if(!settled){settled=true;reject(e);}});
    child.on("close",code=>{clearTimeout(timer);if(settled)return;settled=true;const trace=Buffer.concat(stderr).toString("utf8");if(code!==0)reject(new Error(trace.slice(-16000)||`FFMPEG_EXIT_${code}`));else resolve(trace);});
  });
}

async function project(){const {data,error}=await supabaseAdmin.from("creative_projects").select("*").eq("id",PROJECT).eq("organization_id",ORG).maybeSingle();if(error)throw error;if(!data)throw new Error("SPATIAL_MASTER_V4_PROJECT_NOT_FOUND");return data;}
async function signed(p,seconds=7200){const {data,error}=await supabaseAdmin.storage.from(BUCKET).createSignedUrl(p,seconds);if(error)throw error;if(!data?.signedUrl)throw new Error(`SIGNED_URL_MISSING:${p}`);return data.signedUrl;}
async function exists(p){const dir=p.slice(0,p.lastIndexOf("/")),name=p.slice(p.lastIndexOf("/")+1);const {data,error}=await supabaseAdmin.storage.from(BUCKET).list(dir,{search:name,limit:10});if(error)throw error;return(data||[]).some(x=>x.name===name);}
async function probe(ffprobe,input){return new Promise((resolve,reject)=>{const out=[],err=[];const c=spawn(ffprobe,["-v","error","-show_entries","format=duration:stream=codec_type,codec_name,width,height,r_frame_rate,avg_frame_rate,sample_rate,channels","-of","json",input],{shell:false,stdio:["ignore","pipe","pipe"]});c.stdout.on("data",x=>out.push(x));c.stderr.on("data",x=>err.push(x));c.on("error",reject);c.on("close",code=>{if(code!==0)return reject(new Error(Buffer.concat(err).toString("utf8")||`FFPROBE_EXIT_${code}`));try{resolve(JSON.parse(Buffer.concat(out).toString("utf8")));}catch(e){reject(e);}});});}
async function upload(localPath,storagePath,metadata={}){const bytes=await fs.readFile(localPath);const checksum=crypto.createHash("sha256").update(bytes).digest("hex");const {error}=await supabaseAdmin.storage.from(BUCKET).upload(storagePath,bytes,{contentType:"video/mp4",upsert:true,cacheControl:"3600",metadata:{organization_id:ORG,creative_project_id:PROJECT,checksum,...metadata}});if(error)throw error;return{bytes:bytes.length,checksum};}
function vf(input,label,duration){return `[${input}:v]trim=start=0:end=${duration},setpts=PTS-STARTPTS,fps=24,scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black,setsar=1,format=yuv420p[${label}]`;}

async function renderChunk(index){
  const def=CHUNKS.find(x=>x.index===index);if(!def)throw new Error("SPATIAL_MASTER_V4_CHUNK_INVALID");
  const ffmpeg=resolveCreativeFfmpegPath(),ffprobe=resolveCreativeFfprobePath();if(!ffmpeg||!ffprobe)throw new Error("SPATIAL_MASTER_V4_MEDIA_BINARY_NOT_READY");
  const p=await project(),src=p.metadata?.approved_direction_resume?.sources||{};
  const inputs=[];const durations=[];
  if(def.logo){const logo=String(src.logo_3d||"").trim();if(!logo)throw new Error("SPATIAL_MASTER_V4_LOGO_MISSING");inputs.push(await signed(logo));durations.push(8);}
  for(const u of def.units){const up=unitPath(u);if(!(await exists(up)))throw new Error(`SPATIAL_MASTER_V4_UNIT_MISSING:${u}`);inputs.push(await signed(up));durations.push(UNIT);}
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),`avantiqo-spatial-v4-chunk-${index}-`));const out=path.join(dir,`chunk-${index}.mp4`);
  try{
    const args=["-y","-fflags","+genpts"];inputs.forEach(url=>args.push("-i",url));
    const filters=inputs.map((_,i)=>vf(i,`v${i}`,durations[i]));filters.push(`${inputs.map((_,i)=>`[v${i}]`).join("")}concat=n=${inputs.length}:v=1:a=0[vout]`);
    args.push("-filter_complex",filters.join(";"),"-map","[vout]","-an","-c:v","libx264","-preset","veryfast","-crf","17","-r","24","-vsync","cfr","-pix_fmt","yuv420p","-t",String(def.duration),"-movflags","+faststart",out);
    await run(ffmpeg,args,360000);
    const media=await probe(ffprobe,out),duration=Number(media?.format?.duration||0),video=(media?.streams||[]).find(s=>s.codec_type==="video");
    if(!video||Number(video.width)!==1920||Number(video.height)!==1080)throw new Error(`SPATIAL_MASTER_V4_CHUNK_DIMENSIONS_INVALID:${index}`);
    if(Math.abs(duration-def.duration)>.2)throw new Error(`SPATIAL_MASTER_V4_CHUNK_DURATION_INVALID:${index}:${duration}`);
    const stored=await upload(out,chunkPath(index),{master_contract:"AVANTIQO_SPATIAL_INVESTOR_MASTER_V4",chunk_index:index,cfr_24fps:true,pts_reset:true});
    return{success:true,index,path:chunkPath(index),duration_seconds:duration,bytes:stored.bytes,checksum:stored.checksum,frame_rate:video.r_frame_rate||video.avg_frame_rate};
  }finally{await fs.rm(dir,{recursive:true,force:true}).catch(()=>{});}
}

async function renderFinal(){
  const ffmpeg=resolveCreativeFfmpegPath(),ffprobe=resolveCreativeFfprobePath();if(!ffmpeg||!ffprobe)throw new Error("SPATIAL_MASTER_V4_MEDIA_BINARY_NOT_READY");
  const p=await project(),src=p.metadata?.approved_direction_resume?.sources||{},narration=String(src.narration||"").trim(),score=String(src.score||"").trim();if(!narration||!score)throw new Error("SPATIAL_MASTER_V4_AUDIO_MISSING");
  for(const c of CHUNKS)if(!(await exists(chunkPath(c.index))))throw new Error(`SPATIAL_MASTER_V4_CHUNK_NOT_READY:${c.index}`);
  const [chunkUrls,narrationUrl,scoreUrl]=await Promise.all([Promise.all(CHUNKS.map(c=>signed(chunkPath(c.index)))),signed(narration),signed(score)]);
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),"avantiqo-spatial-v4-final-"));const list=path.join(dir,"chunks.txt"),visual=path.join(dir,"visual.mp4"),out=path.join(dir,"master.mp4");
  try{
    await fs.writeFile(list,chunkUrls.map(url=>`file '${String(url).replace(/'/g,"'\\''")}'`).join("\n"),"utf8");
    await run(ffmpeg,["-y","-protocol_whitelist","file,http,https,tcp,tls,crypto","-f","concat","-safe","0","-i",list,"-an","-c:v","copy","-fflags","+genpts","-movflags","+faststart",visual],120000);
    await run(ffmpeg,["-y","-i",visual,"-i",narrationUrl,"-stream_loop","-1","-i",scoreUrl,"-filter_complex",`[1:a]atrim=0:229.5,asetpts=PTS-STARTPTS,adelay=8000:all=1,aresample=48000,volume=1[voice];[2:a]atrim=0:237.5,asetpts=PTS-STARTPTS,aresample=48000,volume=.22,afade=t=in:st=0:d=2.5,afade=t=out:st=233.5:d=4[score];[voice][score]amix=inputs=2:duration=longest:dropout_transition=0,alimiter=limit=.95[aout]`,"-map","0:v:0","-map","[aout]","-c:v","copy","-c:a","aac","-b:a","256k","-ar","48000","-ac","2","-t","237.5","-movflags","+faststart",out],180000);
    const media=await probe(ffprobe,out),duration=Number(media?.format?.duration||0),streams=media?.streams||[],video=streams.find(s=>s.codec_type==="video"),audio=streams.find(s=>s.codec_type==="audio");
    if(!video||!audio)throw new Error("SPATIAL_MASTER_V4_AV_REQUIRED");if(Number(video.width)!==1920||Number(video.height)!==1080)throw new Error("SPATIAL_MASTER_V4_FINAL_DIMENSIONS_INVALID");if(Math.abs(duration-MASTER)>.25)throw new Error(`SPATIAL_MASTER_V4_FINAL_DURATION_INVALID:${duration}`);
    const stored=await upload(out,FINAL_PATH,{master_contract:"AVANTIQO_SPATIAL_INVESTOR_MASTER_V4",cfr_24fps:true,pts_reset_per_chunk:true});
    const metadata=p.metadata||{},next={contract:"AVANTIQO_SPATIAL_INVESTOR_MASTER_V4",status:"RENDERED_REVIEW_REQUIRED",storage_path:FINAL_PATH,duration_seconds:duration,logo_duration_seconds:8,cfr_24fps:true,pts_reset_per_chunk:true,checksum:stored.checksum,bytes:stored.bytes,technical_qc:{width:Number(video.width),height:Number(video.height),frame_rate:video.r_frame_rate||video.avg_frame_rate,video_codec:video.codec_name||null,audio_codec:audio.codec_name||null,sample_rate:Number(audio.sample_rate||0)||null,channels:Number(audio.channels||0)||null,duration_seconds:duration,av_streams_present:true},updated_at:new Date().toISOString()};
    const {error}=await supabaseAdmin.from("creative_projects").update({metadata:{...metadata,spatial_investor_master_v4:next},updated_at:new Date().toISOString()}).eq("id",PROJECT).eq("organization_id",ORG);if(error)throw error;
    return{success:true,rendered:true,status:next.status,output_path:FINAL_PATH,signed_url:await signed(FINAL_PATH,86400),duration_seconds:duration,logo_duration_seconds:8,cfr_24fps:true,technical_qc:next.technical_qc,bytes:stored.bytes,checksum:stored.checksum};
  }finally{await fs.rm(dir,{recursive:true,force:true}).catch(()=>{});}
}

async function status(){const p=await project(),m=p.metadata?.spatial_investor_master_v4||{};const chunks=[];for(const c of CHUNKS)chunks.push({index:c.index,ready:await exists(chunkPath(c.index)),path:chunkPath(c.index)});const finalReady=await exists(FINAL_PATH);return{success:true,chunks,all_chunks_ready:chunks.every(c=>c.ready),ready:finalReady,status:m.status||"NOT_RENDERED",output_path:finalReady?FINAL_PATH:null,signed_url:finalReady?await signed(FINAL_PATH,86400):null,duration_seconds:m.duration_seconds||MASTER,logo_duration_seconds:m.logo_duration_seconds||8,cfr_24fps:m.cfr_24fps===true,technical_qc:m.technical_qc||null};}

export async function GET(request){try{const url=new URL(request.url);if(url.searchParams.get("token")!==TOKEN)return json({success:false},404);const action=String(url.searchParams.get("action")||"status").toLowerCase();if(action==="status")return json(await status());if(action==="render-chunk")return json(await renderChunk(Number(url.searchParams.get("index"))));if(action==="render-final")return json(await renderFinal());return json({success:false,error:"Unsupported action"},400);}catch(error){console.error("CREATIVE_INVESTOR_SPATIAL_MASTER_V4_FAILED",{message:error?.message||String(error)});return json({success:false,error:error?.message||String(error)},500);}}
