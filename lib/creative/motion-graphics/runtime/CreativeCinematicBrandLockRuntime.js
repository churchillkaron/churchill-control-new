import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import * as AssetGraphRepository from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import { materializeMedia } from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";
import { resolveCreativeFfmpegPath } from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";

export const AVANTIQO_CINEMATIC_BRAND_LOCK_CONTRACT="AVANTIQO_CINEMATIC_BRAND_LOCK_V1";
function text(v){return String(v??"").trim();}
function run(cmd,args,timeout=180000){return new Promise((resolve,reject)=>{const child=spawn(cmd,args,{shell:false,stdio:["ignore","ignore","pipe"]});const err=[];const timer=setTimeout(()=>{child.kill("SIGKILL");reject(new Error("CINEMATIC_BRAND_LOCK_TIMEOUT"));},timeout);child.stderr.on("data",c=>err.push(c));child.on("error",e=>{clearTimeout(timer);reject(e)});child.on("close",code=>{clearTimeout(timer);if(code!==0)reject(new Error(Buffer.concat(err).toString("utf8").slice(-12000)||`CINEMATIC_BRAND_LOCK_EXIT_${code}`));else resolve();});});}
export async function applyCinematicBrandLock({organization_id,buffer,logo_asset_node_id,width=1920,height=1080,duration_seconds=2,policy={}}={}){
  if(!organization_id||!Buffer.isBuffer(buffer)||!buffer.length)throw new Error("CINEMATIC_BRAND_LOCK_SCOPE_REQUIRED");
  const logo=await AssetGraphRepository.getById(logo_asset_node_id);if(!logo?.url)throw new Error("CINEMATIC_BRAND_LOCK_LOGO_ASSET_REQUIRED");
  if(text(logo.organization_id)!==text(organization_id))throw new Error("CINEMATIC_BRAND_LOCK_ORGANIZATION_MISMATCH");
  if(!["LOGO","IMAGE"].includes(text(logo.type).toUpperCase()))throw new Error("CINEMATIC_BRAND_LOCK_LOGO_TYPE_INVALID");
  const material=await materializeMedia({url:logo.url,file_name:logo.name||`${logo.id}.png`,mime_type:logo.technical?.mime_type||null,organization_id,policy});
  const ffmpeg=resolveCreativeFfmpegPath();if(!ffmpeg)throw new Error("CREATIVE_MEDIA_FFMPEG_NOT_READY");
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),"avantiqo-brand-lock-"));const input=path.join(dir,"motion.mov");const output=path.join(dir,"locked.mov");
  try{
    await fs.writeFile(input,buffer);const start=Math.max(0,Number(duration_seconds||0)-Math.min(.9,Number(duration_seconds||0)*.32));const target=Math.max(180,Math.round(Number(width||1920)*.28));
    const filter=`[1:v]format=rgba,scale=${target}:-1,fade=t=in:st=${start.toFixed(3)}:d=0.24:alpha=1[logo];[0:v]format=rgba[base];[base][logo]overlay=x=(W-w)/2:y=(H-h)/2:enable='gte(t,${start.toFixed(3)})':eof_action=pass,format=rgba[out]`;
    await run(ffmpeg,["-y","-i",input,"-loop","1","-i",material.file_path,"-filter_complex",filter,"-map","[out]","-an","-c:v","qtrle","-pix_fmt","argb","-t",String(duration_seconds),output]);
    const locked=await fs.readFile(output);return{contract:AVANTIQO_CINEMATIC_BRAND_LOCK_CONTRACT,buffer:locked,mime_type:"video/quicktime",brand_lock_applied:true,exact_logo_asset_node_id:logo.id,exact_logo_checksum:material.checksum||logo.technical?.checksum||null,generated_logo_pixels_used:false,terminal_lock_start_seconds:start,provider_calls_performed:false};
  }finally{await fs.rm(dir,{recursive:true,force:true}).catch(()=>{});await material.cleanup?.().catch?.(()=>{});}
}
export const CreativeCinematicBrandLockRuntime=Object.freeze({contract:AVANTIQO_CINEMATIC_BRAND_LOCK_CONTRACT,apply:applyCinematicBrandLock});
