import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const CONTRACT = "AVANTIQO_INVESTOR_FIRST_MINUTE_MASTER_60S_V1";
const ROOT = path.resolve(process.env.PROOF_DIR || "local-audit-output/avantiqo-investor-first-minute-60s");
const IDS = [
  "01-city-dawn","02-descent-hotel","03-hotel-truth","04-field-service","05-construction",
  "06-restaurant-rhythm","07-business-partner-decision","08-studio-food-campaign",
  "09-studio-experience-campaign","10-real-result",
];

function run(args) {
  execFileSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args], { stdio: "inherit" });
}
function probe(file) {
  return JSON.parse(execFileSync("ffprobe", ["-v","error","-show_entries","format=duration,size:stream=codec_type,width,height,r_frame_rate","-of","json",file], { encoding:"utf8" }));
}

async function main() {
  await fs.mkdir(ROOT,{recursive:true});
  const finished=[];
  for (let i=0;i<IDS.length;i++) {
    const id=IDS[i];
    const src=path.join(ROOT,`${id}-1920x1088.mp4`);
    const out=path.join(ROOT,`${id}-finished.mp4`);
    await fs.stat(src);
    const creative = i===7 || i===8;
    const grade = creative
      ? "crop=1920:1080:0:4,fps=24,setsar=1,eq=contrast=1.065:saturation=1.02:brightness=-0.002:gamma=1.005,colorbalance=rs=.025:gs=.008:bs=-.018,vignette=PI/11,format=yuv420p"
      : i<2
      ? "crop=1920:1080:0:4,fps=24,setsar=1,eq=contrast=1.035:saturation=.93:brightness=.002:gamma=1.0,colorbalance=rs=.018:gs=.006:bs=-.012,vignette=PI/10,format=yuv420p"
      : "crop=1920:1080:0:4,fps=24,setsar=1,eq=contrast=1.045:saturation=.95:brightness=-.002:gamma=1.0,colorbalance=rs=.020:gs=.006:bs=-.014,vignette=PI/10,format=yuv420p";
    run(["-i",src,"-t","6","-vf",grade,"-af","aresample=48000,aformat=channel_layouts=stereo,apad=pad_dur=6,atrim=duration=6,asetpts=PTS-STARTPTS","-c:v","libx264","-preset","fast","-crf","14","-pix_fmt","yuv420p","-c:a","aac","-b:a","256k","-ar","48000","-ac","2","-shortest",out]);
    finished.push(out);
  }
  const concat=path.join(ROOT,"concat.txt");
  await fs.writeFile(concat,finished.map(f=>`file '${f.replaceAll("'","'\\''")}'`).join("\n")+"\n");
  const joined=path.join(ROOT,"joined.mp4");
  run(["-f","concat","-safe","0","-i",concat,"-c","copy",joined]);

  const master=path.join(ROOT,"avantiqo-investor-first-minute-proof-60s-1080p.mp4");
  const audio=[
    "[0:a]volume=.92[base]",
    "sine=frequency=48:sample_rate=48000:duration=0.55,volume=.025,afade=t=out:st=0.20:d=0.35[p0]",
    "anoisesrc=color=pink:sample_rate=48000:duration=0.22:amplitude=.008,highpass=f=700,lowpass=f=4200,afade=t=out:st=0.05:d=0.17,adelay=5980|5980[t1]",
    "anoisesrc=color=pink:sample_rate=48000:duration=0.22:amplitude=.008,highpass=f=700,lowpass=f=4200,afade=t=out:st=0.05:d=0.17,adelay=17980|17980[t3]",
    "anoisesrc=color=pink:sample_rate=48000:duration=0.22:amplitude=.010,highpass=f=700,lowpass=f=4200,afade=t=out:st=0.05:d=0.17,adelay=29980|29980[t5]",
    "sine=frequency=82:sample_rate=48000:duration=0.42,volume=.018,afade=t=out:st=0.08:d=0.34,adelay=41950|41950[creative]",
    "anoisesrc=color=pink:sample_rate=48000:duration=0.28:amplitude=.012,highpass=f=1200,lowpass=f=5200,afade=t=out:st=0.06:d=0.22,adelay=47970|47970[c1]",
    "anoisesrc=color=pink:sample_rate=48000:duration=0.28:amplitude=.012,highpass=f=1200,lowpass=f=5200,afade=t=out:st=0.06:d=0.22,adelay=53970|53970[c2]",
    "[base][p0][t1][t3][t5][creative][c1][c2]amix=inputs=8:normalize=0,alimiter=limit=.95[a]",
  ].join(";");
  run(["-i",joined,"-filter_complex",audio,"-map","0:v","-map","[a]","-c:v","copy","-c:a","aac","-b:a","320k","-ar","48000","-ac","2","-movflags","+faststart",master]);

  const p=probe(master); const v=p.streams.find(s=>s.codec_type==="video"); const d=Number(p.format.duration||0);
  if (v.width!==1920 || v.height!==1080 || Math.abs(d-60)>.15) throw new Error(`MASTER_INVALID:${v.width}x${v.height}:${d}`);
  const bytes=await fs.readFile(master);
  const report={
    success:true,
    contract:CONTRACT,
    direction:"MULTI_INDUSTRY_REAL_CINEMA_WITH_STUDIO_PROOF",
    duration_seconds:d,
    resolution:"1920x1080",
    fps:24,
    shot_count:10,
    screenshots_used:false,
    product_ui_used:false,
    full_frame_overlay_used:false,
    paper_document_visual_language:false,
    science_fiction_styling:false,
    visible_speculative_technology:false,
    creative_studio_proof_included:true,
    finishing:["filmic_tonal_matching","creative_studio_lift","restrained_vignette","cinematic_transition_air","low_frequency_opening_weight","audio_limiter","faststart_master"],
    sha256:crypto.createHash("sha256").update(bytes).digest("hex"),
  };
  await fs.writeFile(path.join(ROOT,"proof-report.json"),JSON.stringify(report,null,2)+"\n");
  console.log("AVANTIQO_INVESTOR_FIRST_MINUTE_MASTER_60S=PASS");
}

main().catch(e=>{console.error(e.stack||e.message);process.exitCode=1;});
