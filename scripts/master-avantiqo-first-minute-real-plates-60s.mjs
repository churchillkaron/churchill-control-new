import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const CONTRACT = "AVANTIQO_INVESTOR_FIRST_MINUTE_REAL_PLATES_MASTER_60S_V1";
const ROOT = path.resolve(process.env.PROOF_DIR || "local-audit-output/avantiqo-investor-first-minute-real-plates-60s");
const TIMELINE = [
  { id:"01-city-nyc", source:"real", duration:7.0, start:0.0 },
  { id:"02-hotel-lobby", source:"real", duration:6.0, start:0.0 },
  { id:"03-housekeeping", source:"real", duration:6.0, start:0.0 },
  { id:"04-field-service", source:"real", duration:6.0, start:0.0 },
  { id:"05-construction", source:"real", duration:6.0, start:0.0 },
  { id:"06-restaurant-kitchen", source:"real", duration:6.0, start:0.0 },
  { id:"07-restaurant-operator", source:"real", duration:5.0, start:0.0 },
  { id:"08-studio-food-campaign", source:"generated", duration:6.0, start:0.0 },
  { id:"09-evening-experience", source:"real", duration:6.0, start:0.0 },
  { id:"10-real-result", source:"real", duration:6.0, start:0.0 },
];
const TARGET_DURATION = TIMELINE.reduce((n,s)=>n+s.duration,0);

function run(args) {
  execFileSync("ffmpeg", ["-y","-hide_banner","-loglevel","error",...args], {stdio:"inherit"});
}
function probe(file) {
  return JSON.parse(execFileSync("ffprobe",["-v","error","-show_entries","format=duration,size:stream=codec_type,width,height,r_frame_rate","-of","json",file],{encoding:"utf8"}));
}
function srcFor(shot) {
  return path.join(ROOT, shot.source === "generated" ? `${shot.id}-1920x1088.mp4` : `${shot.id}-source.mp4`);
}

async function main() {
  await fs.mkdir(ROOT,{recursive:true});
  const finished=[];
  for (let i=0;i<TIMELINE.length;i++) {
    const shot=TIMELINE[i];
    const src=srcFor(shot);
    await fs.stat(src);
    const out=path.join(ROOT,`${shot.id}-finished.mp4`);
    const creative = shot.id === "08-studio-food-campaign" || shot.id === "09-evening-experience";
    const grade = creative
      ? "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=24,setsar=1,eq=contrast=1.06:saturation=1.02:brightness=-.002:gamma=1.005,colorbalance=rs=.018:gs=.005:bs=-.012,vignette=PI/12,format=yuv420p"
      : shot.id === "01-city-nyc"
      ? "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=24,setsar=1,eq=contrast=1.04:saturation=.98:brightness=.005:gamma=1.0,colorbalance=rs=.016:gs=.004:bs=-.010,vignette=PI/14,format=yuv420p"
      : "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=24,setsar=1,eq=contrast=1.035:saturation=.96:brightness=0:gamma=1.0,colorbalance=rs=.014:gs=.004:bs=-.010,vignette=PI/14,format=yuv420p";

    const args=[
      "-ss",String(shot.start),"-i",src,
      "-f","lavfi","-i","anullsrc=r=48000:cl=stereo",
      "-t",String(shot.duration),
      "-map","0:v:0","-map","1:a:0",
      "-vf",grade,
      "-c:v","libx264","-preset","fast","-crf","14","-pix_fmt","yuv420p",
      "-c:a","aac","-b:a","192k","-ar","48000","-ac","2","-shortest",out
    ];
    run(args);
    finished.push(out);
  }
  const concat=path.join(ROOT,"concat.txt");
  await fs.writeFile(concat,finished.map(f=>`file '${f.replaceAll("'","'\\''")}'`).join("\n")+"\n");
  const joined=path.join(ROOT,"joined.mp4");
  run(["-f","concat","-safe","0","-i",concat,"-c","copy",joined]);

  const master=path.join(ROOT,"avantiqo-investor-first-minute-real-plates-60s-1080p.mp4");
  const audio=[
    "sine=frequency=48:sample_rate=48000:duration=60,volume=0.010,lowpass=f=90[bed0]",
    "anoisesrc=color=pink:sample_rate=48000:duration=60:amplitude=0.0025,lowpass=f=700[bed1]",
    "sine=frequency=72:sample_rate=48000:duration=18,volume=0.004,afade=t=in:st=0:d=5,afade=t=out:st=13:d=5,adelay=41000|41000[lift]",
    "anoisesrc=color=pink:sample_rate=48000:duration=0.22:amplitude=0.012,highpass=f=1200,lowpass=f=5000,afade=t=out:st=0.05:d=0.17,adelay=6990|6990[t1]",
    "anoisesrc=color=pink:sample_rate=48000:duration=0.22:amplitude=0.010,highpass=f=1000,lowpass=f=4500,afade=t=out:st=0.05:d=0.17,adelay=18990|18990[t2]",
    "anoisesrc=color=pink:sample_rate=48000:duration=0.22:amplitude=0.010,highpass=f=1000,lowpass=f=4500,afade=t=out:st=0.05:d=0.17,adelay=36990|36990[t3]",
    "anoisesrc=color=pink:sample_rate=48000:duration=0.28:amplitude=0.015,highpass=f=1400,lowpass=f=5600,afade=t=out:st=0.06:d=0.22,adelay=47970|47970[creative]",
    "[bed0][bed1][lift][t1][t2][t3][creative]amix=inputs=7:normalize=0,alimiter=limit=0.92[a]"
  ].join(";");
  run(["-i",joined,"-filter_complex",audio,"-map","0:v:0","-map","[a]","-c:v","copy","-c:a","aac","-b:a","256k","-ar","48000","-ac","2","-movflags","+faststart",master]);

  const p=probe(master); const v=p.streams.find(s=>s.codec_type==="video"); const d=Number(p.format.duration||0);
  if(v.width!==1920||v.height!==1080||Math.abs(d-TARGET_DURATION)>.18) throw new Error(`MASTER_INVALID:${v.width}x${v.height}:${d}`);
  const bytes=await fs.readFile(master);
  const report={
    success:true, contract:CONTRACT, direction:"REAL_HUMANS_REAL_LOCATIONS_AVANTIQO_CREATIVE_FINISHING",
    duration_seconds:d, resolution:"1920x1080", fps:24, shot_count:TIMELINE.length,
    real_source_shot_count:9, generated_source_shot_count:1,
    generated_source_ids:["08-studio-food-campaign"],
    screenshots_used:false, product_ui_used:false, full_frame_overlay_used:false,
    science_fiction_styling:false, visible_speculative_technology:false,
    paper_document_visual_language:false, creative_studio_proof_included:true,
    source_audio_discarded:true,
    finishing:["source_normalization","filmic_tonal_matching","creative_campaign_lift","restrained_vignette","controlled_sound_bed","faststart_master"],
    sha256:crypto.createHash("sha256").update(bytes).digest("hex")
  };
  await fs.writeFile(path.join(ROOT,"proof-report.json"),JSON.stringify(report,null,2)+"\n");
  console.log("AVANTIQO_INVESTOR_FIRST_MINUTE_REAL_PLATES_MASTER=PASS");
}
main().catch(e=>{console.error(e.stack||e.message);process.exitCode=1;});
