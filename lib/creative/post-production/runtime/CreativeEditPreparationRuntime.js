import { ShotRuntime } from "@/lib/creative/shots/runtime/ShotRuntime";
import { CreativeEditReviewRuntime } from "@/lib/creative/review/runtime/CreativeEditReviewRuntime";
import { CreativeEditorialAssemblyRenderRuntime } from "@/lib/creative/post-production/runtime/CreativeEditorialAssemblyRenderRuntime";
import * as AssetGraphRepository from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";

export const CREATIVE_EDIT_PREPARATION_CONTRACT="CREATIVE_EDIT_PREPARATION_V1";
const REVIEW_PROFILE=Object.freeze({
  id:"avantiqo-edit-review-1080p",
  name:"Avantiqo Edit Review 1080p",
  extension:"mp4",
  container:"mp4",
  video_codec:"libx264",
  width:1920,
  height:1080,
  frame_rate:24,
  pixel_format:"yuv420p",
  fit:"cover",
  include_source_audio:false,
  review_only:true,
});
function text(v){return String(v??"").trim();}
function list(v){return Array.isArray(v)?v.filter(Boolean):[];}

export async function ensureEditPreparation({organization_id,creative_project_id,render_policy={}}={}){
  if(!organization_id||!creative_project_id)throw new Error("EDIT_PREPARATION_SCOPE_REQUIRED");
  const shots=await ShotRuntime.list({organization_id,creative_project_id});
  if(!shots.length)return{contract:CREATIVE_EDIT_PREPARATION_CONTRACT,status:"NOT_APPLICABLE",timeline:null,review_cut:null,picture_lock_required:false};
  const unreleased=shots.filter(shot=>shot.metadata?.shot_release_ready_for_edit!==true||!text(shot.metadata?.final_shot_asset_node_id));
  if(unreleased.length)return{contract:CREATIVE_EDIT_PREPARATION_CONTRACT,status:"AWAITING_SHOT_RELEASE",timeline:null,review_cut:null,picture_lock_required:false,unreleased_shot_ids:unreleased.map(s=>s.id)};

  const prepared=await CreativeEditReviewRuntime.prepare({organization_id,creative_project_id});
  if(prepared.preparation?.status!=="READY"||!prepared.preparation?.timeline?.id){
    return{contract:CREATIVE_EDIT_PREPARATION_CONTRACT,status:prepared.preparation?.status||"AWAITING_TIMELINE",timeline:prepared.preparation?.timeline||null,review_cut:null,picture_lock_required:false,review:prepared.review};
  }
  const timeline=prepared.preparation.timeline;
  const result=await CreativeEditorialAssemblyRenderRuntime.render({
    organization_id,
    timeline_asset_node_id:timeline.id,
    export_profile:REVIEW_PROFILE,
    tracks:{audio:[],overlays:[]},
    policy:render_policy,
  });
  if(!result?.render?.id)throw new Error("EDIT_REVIEW_CUT_RENDER_REQUIRED");
  const alreadyPrepared =
    result.render.metadata?.edit_preparation_contract === CREATIVE_EDIT_PREPARATION_CONTRACT &&
    result.render.metadata?.editorial_review_cut === true &&
    result.render.metadata?.human_picture_lock_required === true;
  const render=alreadyPrepared
    ? result.render
    : await AssetGraphRepository.update(result.render.id,{
        metadata:{
          ...(result.render.metadata||{}),
          edit_preparation_contract:CREATIVE_EDIT_PREPARATION_CONTRACT,
          editorial_review_cut:true,
          review_only:true,
          include_in_master:false,
          selected_for_master:false,
          human_picture_lock_required:true,
          authenticated_edit_approval_required:true,
          final_color_di_forbidden_before_picture_lock:true,
          mastering_forbidden_before_picture_lock:true,
          directed_shot_order_locked:true,
          semantic_reselection_forbidden:true,
          timeline_asset_node_id:timeline.id,
        },
        review:{
          ...(result.render.review||{}),
          human_reviewed:false,
          approved:false,
          notes:"Review cut rendered from director-locked released shot masters. Authenticated picture-lock approval remains required.",
        },
      });
  const review=await CreativeEditReviewRuntime.inspect({organization_id,creative_project_id});
  return{
    contract:CREATIVE_EDIT_PREPARATION_CONTRACT,
    status:review.ready_for_master?"PICTURE_LOCK_APPROVED":"AWAITING_HUMAN_PICTURE_LOCK",
    timeline,
    review_cut:render,
    edit_review:review,
    picture_lock_required:review.ready_for_master!==true,
    human_approval_automated:false,
    mastering_started:false,
    color_di_started:false,
    review_profile:REVIEW_PROFILE,
    changed: prepared.preparation?.reused !== true || result.reused !== true || !alreadyPrepared,
  };
}

export const CreativeEditPreparationRuntime=Object.freeze({
  contract:CREATIVE_EDIT_PREPARATION_CONTRACT,
  review_profile:REVIEW_PROFILE,
  ensure:ensureEditPreparation,
});
