export const MUSIC_PROFESSIONAL_VOCAL_REVIEW_CONTRACT="AVANTIQO_PROFESSIONAL_VOCAL_LISTENING_REVIEW_V1";
export const MUSIC_PROFESSIONAL_VOCAL_REVIEW_THRESHOLD=92;
export const MUSIC_PROFESSIONAL_VOCAL_REVIEW_CRITERIA=Object.freeze([
  "pitch_naturalness","vibrato_preservation","timbre_and_formant_naturalness","consonant_and_transient_integrity","artifact_control","timing_naturalness","emotional_phrasing_preservation","before_after_improvement","commercial_readiness",
]);
function text(v){return String(v??"").trim();}function finite(v,f=null){const n=Number(v);return Number.isFinite(n)?n:f;}
export function validateProfessionalVocalListeningReview(review={}){
  if(text(review.contract)!==MUSIC_PROFESSIONAL_VOCAL_REVIEW_CONTRACT)throw new Error("CREATIVE_MUSIC_PRO_VOCAL_REVIEW_CONTRACT_REQUIRED");
  if(review.source_corrected_comparison_confirmed!==true)throw new Error("CREATIVE_MUSIC_PRO_VOCAL_REVIEW_AB_COMPARISON_REQUIRED");
  if(review.material_artifact_present===true)throw new Error("CREATIVE_MUSIC_PRO_VOCAL_REVIEW_MATERIAL_ARTIFACT_REJECTS");
  const rows=Array.isArray(review.criteria)?review.criteria:[],byId=new Map(rows.map(row=>[text(row?.id),row]));
  const normalized=MUSIC_PROFESSIONAL_VOCAL_REVIEW_CRITERIA.map(id=>{const row=byId.get(id);if(!row)throw new Error(`CREATIVE_MUSIC_PRO_VOCAL_REVIEW_CRITERION_REQUIRED:${id}`);const score=finite(row.score_0_to_100,null);if(score===null||score<0||score>100)throw new Error(`CREATIVE_MUSIC_PRO_VOCAL_REVIEW_SCORE_INVALID:${id}`);if(score<MUSIC_PROFESSIONAL_VOCAL_REVIEW_THRESHOLD)throw new Error(`CREATIVE_MUSIC_PRO_VOCAL_REVIEW_SCORE_BELOW_POLICY:${id}:${score}`);return{id,score_0_to_100:score,notes:text(row.notes)||null};});
  const mean=normalized.reduce((sum,row)=>sum+row.score_0_to_100,0)/normalized.length;
  return{contract:MUSIC_PROFESSIONAL_VOCAL_REVIEW_CONTRACT,status:"APPROVED",threshold:MUSIC_PROFESSIONAL_VOCAL_REVIEW_THRESHOLD,source_corrected_comparison_confirmed:true,material_artifact_present:false,criteria:normalized,minimum_score_0_to_100:Math.min(...normalized.map(row=>row.score_0_to_100)),mean_score_0_to_100:Number(mean.toFixed(2)),notes:text(review.notes)||null,automatic_score_generation_forbidden:true,automatic_approval_forbidden:true};
}
export const CreativeMusicProfessionalVocalReviewRuntime=Object.freeze({contract:MUSIC_PROFESSIONAL_VOCAL_REVIEW_CONTRACT,threshold:MUSIC_PROFESSIONAL_VOCAL_REVIEW_THRESHOLD,criteria:MUSIC_PROFESSIONAL_VOCAL_REVIEW_CRITERIA,validate:validateProfessionalVocalListeningReview});
