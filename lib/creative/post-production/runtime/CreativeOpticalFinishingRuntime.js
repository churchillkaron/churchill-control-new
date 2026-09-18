import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { materializeMedia, CreativeMediaInspectionRuntime } from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";
import { CreativeRenderTechnicalQualityRuntime } from "@/lib/creative/quality/runtime/CreativeRenderTechnicalQualityRuntime";
import { CreativeMultiPassArtifactRuntime } from "@/lib/creative/multipass/runtime/CreativeMultiPassArtifactRuntime";
import * as AssetGraphRepository from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import { CreativeLensSensorProfileRuntime } from "@/lib/creative/post-production/runtime/CreativeLensSensorProfileRuntime";

export const CREATIVE_OPTICAL_FINISHING_CONTRACT="CREATIVE_OPTICAL_FINISHING_V1";
function text(v){return String(v??"").trim();}
function finite(v,f){const n=Number(v);return Number.isFinite(n)?n:f;}
function clamp(v,min,max,f){return Math.max(min,Math.min(max,finite(v,f)));}
function run(command,args,timeoutMs){return new Promise((resolve,reject)=>{const child=spawn(command,args,{shell:false,stdio:["ignore","ignore","pipe"]});const err=[];let timer=null;let done=false;const finish=(e)=>{if(done)return;done=true;if(timer)clearTimeout(timer);e?reject(e):resolve()};if(timeoutMs)timer=setTimeout(()=>{child.kill("SIGKILL");finish(new Error("OPTICAL_FINISH_TIMEOUT"))},timeoutMs);child.stderr.on("data",c=>err.push(c));child.on("error",finish);child.on("close",code=>code===0?finish():finish(new Error(Buffer.concat(err).toString("utf8")||`OPTICAL_FINISH_EXIT_${code}`)))})}
function profile(input={}){
  const authority=CreativeLensSensorProfileRuntime.resolve({
    profile:input,
    render_evidence:input.render_evidence||{},
  });
  if(authority.status!=="READY") throw new Error(`OPTICAL_LENS_SENSOR_PROFILE_BLOCKED:${authority.blockers.join(",")}`);
  return{
    contract:"AVANTIQO_OPTICAL_PROFILE_V2",
    lens_sensor_contract:authority.contract,
    lens_sensor_profile_hash:authority.profile_hash,
    focal_length_mm:authority.lens.focal_length_mm,
    sensor_width_mm:authority.lens.sensor_width_mm,
    lens_k1:authority.lens.k1,
    lens_k2:authority.lens.k2,
    lens_k3:authority.lens.k3,
    chromatic_shift_pixels:authority.lens.chromatic_shift_pixels,
    vignette_angle:authority.lens.vignette_angle,
    bloom_sigma:authority.lens.bloom_sigma,
    bloom_strength:authority.lens.bloom_strength,
    halation_sigma:authority.lens.halation_sigma,
    halation_strength:authority.lens.halation_strength,
    grain_strength:authority.sensor.grain_strength,
    sensor_noise_floor:authority.sensor.noise_floor,
    dynamic_range_stops:authority.sensor.dynamic_range_stops,
    highlight_rolloff:authority.sensor.highlight_rolloff,
    render_time_optics:authority.render_time,
    preserve_audio:true,color_grade_forbidden:true,deterministic_replay_required:true,
  };
}

export async function finishOptically({organization_id,creative_project_id,creative_mission_id=null,shot_id,project,composite_asset,profile:requested={},policy={}}={}){
  if(!composite_asset?.id||!composite_asset?.url) throw new Error("OPTICAL_FINISH_COMPOSITE_ASSET_REQUIRED");
  if(composite_asset.metadata?.shot_candidate_review_passed!==true) throw new Error("OPTICAL_FINISH_COMPOSITE_REVIEW_REQUIRED");
  const p=profile(requested);const ffmpeg=policy.ffmpeg_path||policy.ffmpegPath||process.env.CREATIVE_MEDIA_FFMPEG_PATH;if(!ffmpeg) throw new Error("FFMPEG_NOT_CONFIGURED");
  const timeout=Number(policy.render_timeout_ms||process.env.CREATIVE_MEDIA_RENDER_TIMEOUT_MS||900000);const dir=await fs.mkdtemp(path.join(os.tmpdir(),"avantiqo-optical-"));
  const source=await materializeMedia({url:composite_asset.url,file_name:composite_asset.name||null,mime_type:composite_asset.technical?.mime_type||null,organization_id,policy});
  try{
    const out=path.join(dir,"optical-finish.mp4");
    const shift=Math.max(0,Math.round(p.chromatic_shift_pixels));
    const filters=[];
    filters.push(`lenscorrection=k1=${p.lens_k1}:k2=${p.lens_k2}`);
    if(shift>0) filters.push(`rgbashift=rh=${shift}:bh=-${shift}`);
    if(p.halation_strength>0){
      filters.push(`split=3[clean][bloom][halo]`);
      filters.push(`[bloom]gblur=sigma=${p.bloom_sigma}[blurred]`);
      filters.push(`[clean][blurred]blend=all_mode=screen:all_opacity=${p.bloom_strength}[glow]`);
      filters.push(`[halo]lutrgb=g=0:b=0,gblur=sigma=${p.halation_sigma}[halored]`);
      filters.push(`[glow][halored]blend=all_mode=screen:all_opacity=${p.halation_strength}[optical]`);
      filters.push(`[optical]vignette=angle=${p.vignette_angle},noise=alls=${p.grain_strength}:allf=t+u,format=yuv420p[vout]`);
    }else{
      filters.push(`split=2[clean][bloom]`);
      filters.push(`[bloom]gblur=sigma=${p.bloom_sigma}[blurred]`);
      filters.push(`[clean][blurred]blend=all_mode=screen:all_opacity=${p.bloom_strength}[glow]`);
      filters.push(`[glow]vignette=angle=${p.vignette_angle},noise=alls=${p.grain_strength}:allf=t+u,format=yuv420p[vout]`);
    }
    const args=["-y","-i",source.file_path,"-filter_complex",filters.join(";"),"-map","[vout]","-map","0:a?","-c:v",String(policy.video_codec||"libx264"),"-pix_fmt","yuv420p","-c:a","copy",out];
    await run(ffmpeg,args,timeout);
    const buffer=await fs.readFile(out);
    const artifact=await CreativeMultiPassArtifactRuntime.persist({organization_id,creative_project_id,creative_mission_id,shot_id,pass_id:"optical-finish",artifact_kind:"OPTICAL_FINISH",buffer,mime_type:"video/mp4",extension:"mp4",provider_id:"ffmpeg",capability:"creative.video.optical-finish",upstream_asset_node_ids:[composite_asset.id],technical:{source_checksum:composite_asset.technical?.checksum||null},metadata:{optical_contract:CREATIVE_OPTICAL_FINISHING_CONTRACT,optical_profile:p,optical_profile_contract:p.contract,lens_sensor_contract:p.lens_sensor_contract,lens_sensor_profile_hash:p.lens_sensor_profile_hash,color_grade_applied:false,source_composite_asset_node_id:composite_asset.id,optical_qc_required:true}});
    const inspection=await CreativeMediaInspectionRuntime.inspect({url:artifact.storage_reference,file_name:"optical-finish.mp4",mime_type:"video/mp4",organization_id,policy});
    const technicalQc=CreativeRenderTechnicalQualityRuntime.evaluate({
      technical:inspection.technical||{},
      profile:{
        width:Number(composite_asset.technical?.width||inspection.technical?.width||0)||null,
        height:Number(composite_asset.technical?.height||inspection.technical?.height||0)||null,
        expected_video_codec:"h264",
        duration_tolerance_seconds:0.08,
        audio_required:Boolean(composite_asset.technical?.audio_codec),
      },
      expected_duration_seconds:Number(composite_asset.technical?.duration_seconds||0)||null,
      audio_expected:Boolean(composite_asset.technical?.audio_codec),
    });
    const updated=await AssetGraphRepository.update(artifact.node.id,{
      status:technicalQc.passed?"REVIEW":"REJECTED",
      technical:{...artifact.node.technical,...inspection.technical},
      review:{...artifact.node.review,ai_reviewed:true,approved:false,notes:technicalQc.passed?"Optical finishing technical QC passed; perceptual review remains required.":`Optical finishing technical QC failed: ${technicalQc.failed_checks.join(", ")}`},
      metadata:{...artifact.node.metadata,optical_technical_qc:technicalQc,optical_technical_qc_passed:technicalQc.passed,optical_requires_perceptual_review:true},
    });
    if(!technicalQc.passed) throw new Error(`OPTICAL_FINISH_TECHNICAL_QC_FAILED:${technicalQc.failed_checks.join(",")}`);
    return {contract:CREATIVE_OPTICAL_FINISHING_CONTRACT,shot_id,profile:p,artifact:{...artifact,node:updated},technical_qc:technicalQc,provider_calls_performed:false};
  }finally{await source.cleanup().catch(()=>{});await fs.rm(dir,{recursive:true,force:true}).catch(()=>{})}
}
export const CreativeOpticalFinishingRuntime=Object.freeze({contract:CREATIVE_OPTICAL_FINISHING_CONTRACT,profile,finish:finishOptically});
