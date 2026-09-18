import crypto from "node:crypto";

export const AVANTIQO_MATCHMOVE_AUTHORITY_CONTRACT="AVANTIQO_MATCHMOVE_AUTHORITY_V1";
function text(v){return String(v??"").trim();}
function list(v){return Array.isArray(v)?v.filter(Boolean):[];}
function finite(v,f=0){const n=Number(v);return Number.isFinite(n)?n:f;}
function hash(v){return crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");}
export function evaluateMatchmove({track_result={},camera_intrinsics=null,lens_model=null,parallax_evidence=null,rolling_shutter_model=null,object_tracks=[]}={}){
  const samples=list(track_result?.samples);const inliers=samples.map(s=>finite(s.inliers,0)).filter(x=>x>0);const points=samples.map(s=>finite(s.tracked_points,0)).filter(x=>x>0);const median=(xs)=>{if(!xs.length)return 0;const a=[...xs].sort((x,y)=>x-y);return a[Math.floor(a.length/2)];};
  const has2d=samples.length>=2&&median(points)>=12&&median(inliers)>=6;
  const has3d=Boolean(has2d&&camera_intrinsics&&lens_model&&parallax_evidence?.sufficient===true);
  const mode=has3d?"CAMERA_3D_SOLVE":has2d?"PLANAR_AFFINE_TRACK":"UNRESOLVED";
  const blockers=[];
  if(!has2d)blockers.push("MATCHMOVE_TRACK_EVIDENCE_INSUFFICIENT");
  if(mode!=="CAMERA_3D_SOLVE")blockers.push("MATCHMOVE_WORLD_SPACE_CGI_NOT_AUTHORIZED");
  const body={contract:AVANTIQO_MATCHMOVE_AUTHORITY_CONTRACT,mode,track_sample_count:samples.length,median_tracked_points:median(points),median_inliers:median(inliers),camera_intrinsics:camera_intrinsics||null,lens_model:lens_model||null,parallax_evidence:parallax_evidence||null,rolling_shutter_model:rolling_shutter_model||null,object_tracks:list(object_tracks),authority:{screen_replacement_allowed:has2d,planar_graphics_allowed:has2d,world_space_cgi_allowed:has3d,large_camera_orbit_reconstruction_allowed:false,single_view_reverse_angle_forbidden:true},policy:{lens_distortion_solution_required_for_pixel_locked_cg:true,rolling_shutter_compensation_required_when_detected:true,object_track_required_for_independent_moving_subjects:true,track_confidence_must_survive_full_shot:true}};
  return{...body,status:has2d?"READY":"BLOCKED",blockers,authority_hash:hash(body)};
}
export const CreativeMatchmoveAuthorityRuntime=Object.freeze({contract:AVANTIQO_MATCHMOVE_AUTHORITY_CONTRACT,evaluate:evaluateMatchmove});
