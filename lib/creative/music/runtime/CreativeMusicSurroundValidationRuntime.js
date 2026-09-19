import { spawn } from "node:child_process";
import { materializeMedia } from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";
import { createMusicSpatialAudioConfig } from "./CreativeMusicSpatialAudioRuntime.js";

const CONTRACT = "AVANTIQO_MUSIC_SURROUND_TECHNICAL_VALIDATION_V1";
function text(value){return String(value??"").trim();}
function finite(value,fallback=null){const n=Number(value);return Number.isFinite(n)?n:fallback;}

function run(command,args,timeoutMs=180000){return new Promise((resolve,reject)=>{const child=spawn(command,args,{shell:false,stdio:["ignore","pipe","pipe"]});const stdout=[],stderr=[];const timer=setTimeout(()=>{child.kill("SIGKILL");reject(new Error("CREATIVE_MUSIC_SURROUND_VALIDATION_TIMEOUT"));},timeoutMs);child.stdout.on("data",c=>stdout.push(c));child.stderr.on("data",c=>stderr.push(c));child.on("error",e=>{clearTimeout(timer);reject(e);});child.on("close",code=>{clearTimeout(timer);const out={stdout:Buffer.concat(stdout).toString("utf8"),stderr:Buffer.concat(stderr).toString("utf8")};if(code===0)resolve(out);else reject(new Error(out.stderr||`CREATIVE_MUSIC_SURROUND_VALIDATION_EXIT_${code}`));});});}

async function probe(ffprobe,file){const result=await run(ffprobe,["-v","error","-show_entries","format=duration:stream=codec_name,codec_type,sample_rate,channels,channel_layout,bits_per_raw_sample,sample_fmt","-of","json",file],120000);const parsed=JSON.parse(result.stdout||"{}");const stream=(parsed.streams||[]).find(x=>x.codec_type==="audio");if(!stream)throw new Error("CREATIVE_MUSIC_SURROUND_AUDIO_STREAM_REQUIRED");return {duration_seconds:finite(parsed.format?.duration),codec_name:text(stream.codec_name)||null,sample_rate:finite(stream.sample_rate),channels:finite(stream.channels),channel_layout:text(stream.channel_layout)||null,bits_per_raw_sample:finite(stream.bits_per_raw_sample),sample_format:text(stream.sample_fmt)||null};}

function loudnessJson(stderr){const matches=[...String(stderr||"").matchAll(/\{\s*"input_i"[\s\S]*?\}/gm)];if(!matches.length)return null;try{return JSON.parse(matches.at(-1)[0]);}catch{return null;}}
async function loudness(ffmpeg,file,filter=null){const args=["-hide_banner","-nostats","-i",file];if(filter)args.push("-af",`${filter},loudnorm=I=-24:LRA=20:TP=-1:print_format=json`);else args.push("-af","loudnorm=I=-24:LRA=20:TP=-1:print_format=json");args.push("-f","null","-");const result=await run(ffmpeg,args);const d=loudnessJson(result.stderr);if(!d)throw new Error("CREATIVE_MUSIC_SURROUND_LOUDNESS_EVIDENCE_REQUIRED");return {integrated_lufs:finite(d.input_i),true_peak_dbtp:finite(d.input_tp),loudness_range_lu:finite(d.input_lra),threshold_lufs:finite(d.input_thresh)};}

function volumeMean(stderr){const match=String(stderr||"").match(/mean_volume:\s*(-?inf|-?\d+(?:\.\d+)?)\s*dB/i);if(!match)return null;if(/inf/i.test(match[1]))return -Infinity;return finite(match[1]);}
async function meanVolume(ffmpeg,file,filter){const result=await run(ffmpeg,["-hide_banner","-nostats","-i",file,"-af",`${filter},volumedetect`,"-f","null","-"]);return volumeMean(result.stderr);}

function channelPan(index){return `pan=mono|c0=c${index}`;}
function downmixFilter(layout){if(layout==="5.1")return "pan=stereo|c0=FL+0.70710678*FC+0.70710678*SL|c1=FR+0.70710678*FC+0.70710678*SR";if(layout==="7.1")return "pan=stereo|c0=FL+0.70710678*FC+0.70710678*BL+0.70710678*SL|c1=FR+0.70710678*FC+0.70710678*BR+0.70710678*SR";return "anull";}

export async function validateMusicSurroundPremaster({organization_id,file_url,file_name=null,mime_type="audio/wav",expected={},media_tools={}}={}){
  if(!organization_id)throw new Error("CREATIVE_MUSIC_SURROUND_VALIDATION_ORGANIZATION_REQUIRED");if(!file_url)throw new Error("CREATIVE_MUSIC_SURROUND_VALIDATION_FILE_REQUIRED");
  const spatial=createMusicSpatialAudioConfig({layout_id:expected.layout_id||expected.channel_layout||"5.1",lfe:{low_pass_hz:expected.lfe_low_pass_hz}});if(!spatial.surround_enabled)throw new Error("CREATIVE_MUSIC_SURROUND_VALIDATION_LAYOUT_REQUIRED");
  const ffmpeg=text(media_tools.ffmpeg||process.env.CREATIVE_FFMPEG_PATH)||"ffmpeg",ffprobe=text(media_tools.ffprobe||process.env.CREATIVE_FFPROBE_PATH)||"ffprobe";
  const material=await materializeMedia({url:file_url,file_name:file_name||"surround-premaster.wav",mime_type,organization_id,policy:{max_bytes:2_147_483_648,timeout_ms:300000,max_redirects:0}});
  try{
    const media=await probe(ffprobe,material.file_path);const failures=[],warnings=[];
    if(Math.round(media.channels)!==spatial.channel_count)failures.push("SURROUND_CHANNEL_COUNT_MISMATCH");
    if(Math.round(media.sample_rate)!==Math.round(finite(expected.sample_rate,media.sample_rate)))failures.push("SURROUND_SAMPLE_RATE_MISMATCH");
    if(media.codec_name!=="pcm_s24le"||Math.round(media.bits_per_raw_sample)!==24)failures.push("SURROUND_PCM24_REQUIRED");
    const acceptableLayouts=spatial.layout_id==="5.1"?new Set(["5.1(side)"]):new Set(["7.1"]);if(!acceptableLayouts.has(media.channel_layout))failures.push("SURROUND_CHANNEL_LAYOUT_MISMATCH");

    const program=await loudness(ffmpeg,material.file_path);const perSpeaker=[];
    for(let index=0;index<spatial.channel_count;index+=1){const measured=await loudness(ffmpeg,material.file_path,channelPan(index));const row={speaker:spatial.speaker_order[index],channel_index:index,...measured};perSpeaker.push(row);if(Number.isFinite(measured.true_peak_dbtp)&&measured.true_peak_dbtp>-0.1)failures.push(`SURROUND_CHANNEL_TRUE_PEAK_EXCEEDED:${row.speaker}`);}
    const lfeIndex=spatial.speaker_order.indexOf("LFE");let lfeQc=null;
    if(lfeIndex>=0){const baseFilter=channelPan(lfeIndex);const fullMean=await meanVolume(ffmpeg,material.file_path,baseFilter);const highStart=Math.max(160,Math.round(spatial.lfe.low_pass_hz*1.5));const highMean=await meanVolume(ffmpeg,material.file_path,`${baseFilter},highpass=f=${highStart}`);const relative=Number.isFinite(fullMean)&&Number.isFinite(highMean)?highMean-fullMean:highMean===-Infinity?-Infinity:null;const passed=relative==null||relative===-Infinity||relative<=-12;if(!passed)failures.push("SURROUND_LFE_HIGH_BAND_EXCESS");lfeQc={speaker:"LFE",low_pass_hz:spatial.lfe.low_pass_hz,high_band_test_hz:highStart,full_mean_db:fullMean,high_band_mean_db:highMean,high_band_relative_db:relative,passed};}
    const foldFilter=downmixFilter(spatial.layout_id);const stereoDownmix=await loudness(ffmpeg,material.file_path,foldFilter);if(Number.isFinite(stereoDownmix.true_peak_dbtp)&&stereoDownmix.true_peak_dbtp>-0.1)failures.push("SURROUND_STEREO_DOWNMIX_TRUE_PEAK_EXCEEDED");const monoDownmix=await loudness(ffmpeg,material.file_path,`${foldFilter},pan=mono|c0=0.5*c0+0.5*c1`);if(Number.isFinite(monoDownmix.true_peak_dbtp)&&monoDownmix.true_peak_dbtp>-0.1)warnings.push("SURROUND_MONO_DOWNMIX_TRUE_PEAK_HIGH");
    const passed=failures.length===0;
    return {success:passed,passed,contract:CONTRACT,verdict:passed?"PASS":"FAIL",validated_at:new Date().toISOString(),failures:[...new Set(failures)],warnings:[...new Set(warnings)],expected:{layout_id:spatial.layout_id,channels:spatial.channel_count,speaker_order:[...spatial.speaker_order],sample_rate:Math.round(finite(expected.sample_rate,media.sample_rate)),codec_name:"pcm_s24le",bits_per_raw_sample:24,lfe_low_pass_hz:spatial.lfe.low_pass_hz},observed:{...media,file_size_bytes:material.file_size_bytes||null,program_loudness:program,per_speaker:perSpeaker,lfe:lfeQc,stereo_downmix:stereoDownmix,mono_downmix:monoDownmix},actual_rendered_audio_is_authority:true,technical_only:true,dolby_certification_performed:false,remastering_performed:false,provider_job_submitted:false};
  }finally{await material.cleanup().catch(()=>{});}
}

export const CreativeMusicSurroundValidationRuntime=Object.freeze({contract:CONTRACT,validate:validateMusicSurroundPremaster});
