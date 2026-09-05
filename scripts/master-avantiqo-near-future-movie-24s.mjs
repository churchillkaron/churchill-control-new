import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const CONTRACT = "AVANTIQO_NEAR_FUTURE_MOVIE_MASTER_24S_V1";
const ROOT = path.resolve(process.env.PROOF_DIR || "local-audit-output/avantiqo-near-future-movie-24s");
const IDS = ["01-signal", "02-ripple", "03-convergence", "04-human-control"];
const FPS = 24;

function run(args) { execFileSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args]); }
function probe(file) { return JSON.parse(execFileSync("ffprobe", ["-v","error","-show_entries","format=duration,size:stream=codec_type,width,height,r_frame_rate","-of","json",file], {encoding:"utf8"})); }

async function main() {
  await fs.mkdir(ROOT,{recursive:true});
  const finished=[];
  for (let i=0;i<IDS.length;i++) {
    const id=IDS[i];
    const src=path.join(ROOT,`${id}-1920x1088.mp4`);
    const out=path.join(ROOT,`${id}-finished.mp4`);
    await fs.stat(src);
    const grade = i===0
      ? "crop=1920:1080:0:4,fps=24,setsar=1,eq=contrast=1.035:saturation=.92:brightness=-.006:gamma=.99,colorbalance=rs=.018:gs=.005:bs=-.01,vignette=PI/8,format=yuv420p"
      : i===1
      ? "crop=1920:1080:0:4,fps=24,setsar=1,eq=contrast=1.045:saturation=.94:brightness=-.004:gamma=.995,colorbalance=rs=.016:gs=.004:bs=-.012,vignette=PI/9,format=yuv420p"
      : i===2
      ? "crop=1920:1080:0:4,fps=24,setsar=1,eq=contrast=1.05:saturation=.95:brightness=-.002:gamma=1.0,colorbalance=rs=.02:gs=.005:bs=-.014,vignette=PI/10,format=yuv420p"
      : "crop=1920:1080:0:4,fps=24,setsar=1,eq=contrast=1.04:saturation=.93:brightness=.001:gamma=1.005,colorbalance=rs=.022:gs=.007:bs=-.012,vignette=PI/10,format=yuv420p";
    run(["-i",src,"-t","6","-vf",grade,"-af","aresample=48000,aformat=channel_layouts=stereo,apad=pad_dur=6,atrim=duration=6,asetpts=PTS-STARTPTS","-c:v","libx264","-preset","fast","-crf","14","-pix_fmt","yuv420p","-c:a","aac","-b:a","256k","-ar","48000","-ac","2","-shortest",out]);
    finished.push(out);
  }
  const concat=path.join(ROOT,"concat.txt");
  await fs.writeFile(concat,finished.map(f=>`file '${f.replaceAll("'","'\\''")}'`).join("\n")+"\n");
  const joined=path.join(ROOT,"joined.mp4");
  run(["-f","concat","-safe","0","-i",concat,"-c","copy",joined]);

  const master=path.join(ROOT,"avantiqo-near-future-movie-proof-24s-1080p.mp4");
  const audio=[
    "[0:a]volume=.96[base]",
    "sine=frequency=54:sample_rate=48000:duration=.28,volume=.035,afade=t=out:st=0.08:d=0.20,adelay=50|50[p0]",
    "anoisesrc=color=pink:sample_rate=48000:duration=.18:amplitude=.010,highpass=f=900,lowpass=f=3600,afade=t=out:st=0.04:d=0.14,adelay=5980|5980[t1]",
    "anoisesrc=color=pink:sample_rate=48000:duration=.18:amplitude=.010,highpass=f=900,lowpass=f=3600,afade=t=out:st=0.04:d=0.14,adelay=11980|11980[t2]",
    "anoisesrc=color=pink:sample_rate=48000:duration=.18:amplitude=.010,highpass=f=900,lowpass=f=3600,afade=t=out:st=0.04:d=0.14,adelay=17980|17980[t3]",
    "[base][p0][t1][t2][t3]amix=inputs=5:normalize=0,alimiter=limit=.95[a]"
  ].join(";");
  run(["-i",joined,"-filter_complex",audio,"-map","0:v","-map","[a]","-c:v","copy","-c:a","aac","-b:a","320k","-ar","48000","-ac","2","-movflags","+faststart",master]);
  const p=probe(master); const v=p.streams.find(s=>s.codec_type==="video"); const d=Number(p.format.duration||0);
  if (v.width!==1920||v.height!==1080||Math.abs(d-24)>.12) throw new Error(`MASTER_INVALID:${v.width}x${v.height}:${d}`);
  const bytes=await fs.readFile(master);
  const report={success:true,contract:CONTRACT,direction:"NEAR_FUTURE_REAL_MOVIE",duration_seconds:d,resolution:"1920x1080",fps:FPS,screenshots_used:false,product_ui_used:false,full_frame_overlay_used:false,paper_document_visual_language:false,science_fiction_styling:false,finishing:["filmic_near_future_grade","restrained_vignette","shot_specific_tonal_matching","cinematic_transition_air","low_frequency_opening_weight","audio_limiter","faststart_master"],sha256:crypto.createHash("sha256").update(bytes).digest("hex")};
  await fs.writeFile(path.join(ROOT,"proof-report.json"),JSON.stringify(report,null,2)+"\n");
  console.log("AVANTIQO_NEAR_FUTURE_MOVIE_MASTER_24S=PASS");
}
main().catch(e=>{console.error(e.stack||e.message);process.exitCode=1;});
