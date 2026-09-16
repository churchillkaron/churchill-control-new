import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const CONTRACT='AVANTIQO_MUSIC_EDIT_HUMAN_REVIEW_RESULT_V1';
const PREP_CONTRACT='AVANTIQO_MUSIC_EDIT_HUMAN_REVIEW_PREP_V1';
const text=(v)=>String(v??'').trim();
const arg=(p)=>text(process.argv.slice(2).find((e)=>e.startsWith(p))?.slice(p.length));
const required=(p,c)=>{const v=arg(p); if(!v) throw new Error(c); return v;};
const reviewPath=resolve(required('--review=','AVANTIQO_MUSIC_EDIT_REVIEW_PATH_REQUIRED'));
const verdict=required('--verdict=','AVANTIQO_MUSIC_EDIT_VERDICT_REQUIRED').toUpperCase();
if(!['APPROVED','REJECTED'].includes(verdict)) throw new Error('AVANTIQO_MUSIC_EDIT_VERDICT_INVALID');
const reviewer=required('--reviewer=','AVANTIQO_MUSIC_EDIT_REVIEWER_REQUIRED');
const notes=arg('--notes=');
const scoresRaw=required('--scores=','AVANTIQO_MUSIC_EDIT_REVIEW_SCORES_REQUIRED');
const scores=scoresRaw.split(',').map((v)=>Number(v.trim()));
if(scores.length!==6||scores.some((v)=>!Number.isFinite(v)||v<0||v>100)) throw new Error('AVANTIQO_MUSIC_EDIT_REVIEW_SCORES_INVALID');
const averageScore=scores.reduce((sum,v)=>sum+v,0)/scores.length;
if(verdict==='APPROVED'&&averageScore<92) throw new Error('AVANTIQO_MUSIC_EDIT_REVIEW_SCORE_BELOW_THRESHOLD');
const review=JSON.parse(await readFile(reviewPath,'utf8'));
if(review?.contract!==PREP_CONTRACT||review?.waveform_integrity?.preservation_passed!==true||review?.waveform_integrity?.edit_changed_passed!==true||review?.automatic_human_approval_forbidden!==true||Number(review?.minimum_average_score||92)!==92){
  throw new Error('AVANTIQO_MUSIC_EDIT_REVIEW_PREP_INVALID');
}
const result={success:true,contract:CONTRACT,generated_at:new Date().toISOString(),review_path:reviewPath,benchmark_job_id:review.benchmark_job_id,capability:'ai.audio.edit',human_review_status:verdict,reviewer,notes:notes||null,technical_integrity_passed:true,criterion_scores:scores,average_score:Number(averageScore.toFixed(2)),minimum_average_score:92,automatic_human_approval_forbidden:true,eligible_for_later_release_decision:verdict==='APPROVED',production_certified:false,production_activation_allowed:false,pricing_activation_allowed:false,provider_selection_change_allowed:false,provider_jobs_submitted:0};
const outputPath=resolve(arg('--output=')||`/tmp/music-edit-human-review-${review.benchmark_job_id||Date.now()}.json`);
await writeFile(outputPath,`${JSON.stringify(result,null,2)}\n`);
console.log(JSON.stringify({success:true,contract:CONTRACT,human_review_status:verdict,average_score:result.average_score,eligible_for_later_release_decision:result.eligible_for_later_release_decision,output_path:outputPath,production_activation_performed:false},null,2));
