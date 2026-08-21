export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import sharp from "sharp";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveCreativeFfmpegPath } from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";

const TOKEN = "avq-investor-spatial-master-v5-qc-thumb-20260821";
const BUCKET = "creative-assets";
const ORG = "33336a72-acb5-474e-856b-8be0269360e2";
const PROJECT = "37ca49f2-210d-4665-af6b-6b5fa834f750";
const MASTER = `${ORG}/${PROJECT}/spatial-master-v5-final/avantiqo-investor-film-spatial-master-v5-ai-hero.mp4`;
const TIMES = [1,7.5,9.5,30,65,110,155,200,230];

const json = (data, status=200) => Response.json(data,{status,headers:{"Cache-Control":"no-store, private"}});

function run(command,args,timeoutMs=180000){
  return new Promise((resolve,reject)=>{
    const child=spawn(command,args,{shell:false,stdio:["ignore","ignore","pipe"]});
    const stderr=[];
    const timer=setTimeout(()=>{child.kill("SIGKILL");reject(new Error("V5_QC_THUMB_TIMEOUT"));},timeoutMs);
    child.stderr.on("data",c=>stderr.push(c));
    child.on("error",e=>{clearTimeout(timer);reject(e);});
    child.on("close",code=>{clearTimeout(timer);code===0?resolve():reject(new Error(Buffer.concat(stderr).toString("utf8").slice(-8000)||`V5_QC_THUMB_FFMPEG_${code}`));});
  });
}

async function download(target){
  const {data,error}=await supabaseAdmin.storage.from(BUCKET).download(MASTER);
  if(error) throw error;
  if(!data) throw new Error("V5_QC_THUMB_MASTER_EMPTY");
  await fs.writeFile(target,Buffer.from(await data.arrayBuffer()));
}

function labelSvg(seconds){
  const m=Math.floor(seconds/60),s=Math.floor(seconds%60),label=`${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  return Buffer.from(`<svg width="150" height="84" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="62" width="45" height="18" rx="5" fill="#020205" fill-opacity=".82"/><text x="9" y="76" fill="#f5dfaa" font-family="Arial" font-size="10" font-weight="700">${label}</text></svg>`);
}

async function frame(ffmpeg,master,dir,seconds,index){
  const raw=path.join(dir,`f-${index}.jpg`);
  await run(ffmpeg,["-y","-ss",String(seconds),"-i",master,"-frames:v","1","-vf","scale=150:84:force_original_aspect_ratio=increase,crop=150:84","-q:v","6",raw],30000);
  return sharp(raw).composite([{input:labelSvg(seconds),top:0,left:0}]).jpeg({quality:42,mozjpeg:true}).toBuffer();
}

export async function GET(request){
  try{
    const url=new URL(request.url);
    if(url.searchParams.get("token")!==TOKEN) return json({success:false},404);
    const ffmpeg=resolveCreativeFfmpegPath();
    if(!ffmpeg) throw new Error("V5_QC_THUMB_FFMPEG_NOT_READY");
    const dir=await fs.mkdtemp(path.join(os.tmpdir(),"avantiqo-v5-qc-thumb-"));
    try{
      const master=path.join(dir,"master.mp4");
      await download(master);
      const frames=[];
      for(let i=0;i<TIMES.length;i+=1) frames.push(await frame(ffmpeg,master,dir,TIMES[i],i));
      const cw=150,ch=84,gap=3,cols=3,rows=3,width=456,height=258;
      const sheet=await sharp({create:{width,height,channels:3,background:{r:3,g:3,b:7}}})
        .composite(frames.map((input,i)=>({input,left:(i%cols)*(cw+gap),top:Math.floor(i/cols)*(ch+gap)})))
        .jpeg({quality:38,mozjpeg:true}).toBuffer();
      return json({success:true,frame_times_seconds:TIMES,width,height,bytes:sheet.length,jpeg_base64:sheet.toString("base64")});
    }finally{await fs.rm(dir,{recursive:true,force:true}).catch(()=>{});}
  }catch(error){return json({success:false,error:error?.message||String(error)},500);}
}
