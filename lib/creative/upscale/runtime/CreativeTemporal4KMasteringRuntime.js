import crypto from "node:crypto";

export const AVANTIQO_TEMPORAL_4K_MASTERING_CONTRACT="AVANTIQO_TEMPORAL_4K_MASTERING_V1";
function finite(v,f=0){const n=Number(v);return Number.isFinite(n)?n:f;}
function text(v){return String(v??"").trim();}
function hash(v){return crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");}
export function planTemporal4K({source_width,source_height,fps,frame_count,source_asset_node_id,source_checksum=null,audio_asset_node_id=null,model="FLASHVSR_V1_1",target_width=3840,target_height=2160}={}){
  const w=finite(source_width),h=finite(source_height),frames=Math.round(finite(frame_count)),rate=finite(fps);const blockers=[];
  if(w<1280||h<720)blockers.push("TEMPORAL_4K_SOURCE_TOO_SMALL");
  if(w>2048||h>1152)blockers.push("TEMPORAL_4K_SOURCE_ALREADY_ABOVE_PRODUCTION_LANE");
  if(!frames||!rate)blockers.push("TEMPORAL_4K_TIMING_REQUIRED");
  if(!text(source_asset_node_id))blockers.push("TEMPORAL_4K_SOURCE_ASSET_REQUIRED");
  const padded=frames?Math.max(9,1+Math.ceil(Math.max(0,frames-1)/8)*8):0;
  const body={contract:AVANTIQO_TEMPORAL_4K_MASTERING_CONTRACT,source_asset_node_id:text(source_asset_node_id)||null,source_checksum:text(source_checksum)||null,source:{width:w,height:h,fps:rate,frame_count:frames},flashvsr:{worker_contract:"AVANTIQO_VIDEO_FLASHVSR_GPU_MASTER_V1",model:text(model),source_frame_count:frames,padded_frame_count:padded,temporal_model_required:true,per_frame_independent_sr_forbidden:true},delivery:{mastering_surface_policy:"TEMPORAL_SR_THEN_EXACT_DELIVERY_NORMALIZATION",target_width:Number(target_width),target_height:Number(target_height),exact_delivery_resolution_required:true,reencode_after_sr_allowed:true,audio_remux_asset_node_id:text(audio_asset_node_id)||null},qc:{temporal_flicker_check:true,detail_crawl_check:true,identity_drift_check:true,edge_ringing_check:true,over_sharpening_check:true,grain_restoration_after_sr:true,source_to_master_frame_count_preserved:true,source_to_master_duration_preserved:true}};
  return{...body,status:blockers.length?"BLOCKED":"READY",blockers,plan_hash:hash(body)};
}
export const CreativeTemporal4KMasteringRuntime=Object.freeze({contract:AVANTIQO_TEMPORAL_4K_MASTERING_CONTRACT,plan:planTemporal4K});
