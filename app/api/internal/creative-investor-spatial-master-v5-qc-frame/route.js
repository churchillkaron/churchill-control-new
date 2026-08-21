export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import sharp from "sharp";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveCreativeFfmpegPath } from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";

const TOKEN = "avq-investor-spatial-master-v5-qc-frame-20260821";
const BUCKET = "creative-assets";
const ORG = "33336a72-acb5-474e-856b-8be0269360e2";
const PROJECT = "37ca49f2-210d-4665-af6b-6b5fa834f750";
const MASTER = `${ORG}/${PROJECT}/spatial-master-v5-final/avantiqo-investor-film-spatial-master-v5-ai-hero.mp4`;
const ALLOWED = [9.5,30,65,110,155,200,230];

const json=(data,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store, private"}});
function run(command,args,timeoutMs=90000){return new Promise((resolve,reject)=>{const child=spawn(command,args,{shell:false,stdio:["ignore","ignore","pipe"]});const stderr=[];const timer=setTimeout(()=>{child.kill("SIGKILL");reject(new Error("V5_QC_FRAME_TIMEOUT"));},timeoutMs);child.stderr.on("data",c=>stderr.push(c));child.on("error",e=>{clearTimeout(timer);reject(e);});child.on("close",code=>{clearTimeout(timer);code===0?resolve():reject(new Error(Buffer.concat(stderr).toString("utf8").slice(-8000)||`V5_QC_FRAME_FFMPEG_${code}`));});});}
async function download(target){const {data,error}=await supabaseAdmin.storage.from(BUCKET).download(MASTER);if(error)throw error;if(!data)throw new Error("V5_QC_FRAME_MASTER_EMPTY");await fs.writeFile(target,Buffer.from(await data.arrayBuffer()));}
export async function GET(request){try{const url=new URL(request.url);if(url.searchParams.get("token")!==TOKEN)return json({success:false},404);const requested=Number(url.searchParams.get("time"));const seconds=ALLOWED.find(v=>Math.abs(v-requested)<.01);if(seconds===undefined)return json({success:false,error:"Unsupported time",allowed:ALLOWED},400);const ffmpeg=resolveCreativeFfmpegPath();if(!ffmpeg)throw new Error("V5_QC_FRAME_FFMPEG_NOT_READY");const dir=await fs.mkdtemp(path.join(os.tmpdir(),"avantiqo-v5-qc-frame-"));try{const master=path.join(dir,"master.mp4"),raw=path.join(dir,"raw.jpg");await download(master);await run(ffmpeg,["-y","-ss",String(seconds),"-i",master,"-frames:v","1","-vf","scale=360:203:force_original_aspect_ratio=increase,crop=360:203","-q:v","4",raw],45000);const frame=await sharp(raw).jpeg({quality:62,mozjpeg:true}).toBuffer();return json({success:true,time_seconds:seconds,width:360,height:203,bytes:frame.length,jpeg_base64:frame.toString("base64")});}finally{await fs.rm(dir,{recursive:true,force:true}).catch(()=>{});}}catch(error){return json({success:false,error:error?.message||String(error)},500);}}
