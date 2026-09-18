import crypto from "node:crypto";
import { validateAudioPostSessionEditorial } from "./CreativeAudioPostEditorialRuntime.js";
import { buildProfessionalAudioDeliveryManifest } from "./CreativeProfessionalAudioEngineRuntime.js";
import { validateAudioPostMix } from "./CreativeAudioPostMixRuntime.js";
import { evaluateAudioPostFinalQc } from "./CreativeAudioPostFinalQcRuntime.js";
import { buildAudioPostLanguageVersionManifest, isLanguageScopedPostStem } from "./CreativeAudioPostVersionRuntime.js";
import { evaluateAudioPostListeningReview } from "./CreativeAudioPostListeningReviewRuntime.js";

const CONTRACT="AVANTIQO_AUDIO_POST_DELIVERY_PACKAGE_V1";
function text(v){return String(v??"").trim();}function finite(v,f=null){const n=Number(v);return Number.isFinite(n)?n:f;}
function currentAsset(asset,revision){return Math.round(finite(asset?.metadata?.project_revision,-1))===Math.round(finite(revision,0));}
function assetKind(asset){return text(asset?.metadata?.music_asset_kind||asset?.asset_type||asset?.kind).toUpperCase();}
function deliveryCode(asset){return text(asset?.metadata?.professional_audio_delivery_code).toUpperCase();}
function technicalStemOk(asset,expectedChannels){const m=asset?.metadata||{};return currentAsset(asset,m.project_revision)&&Math.round(finite(m.channels,-1))===Math.round(expectedChannels)&&finite(m.peak_dbfs,null)!==null&&finite(m.rms_dbfs,null)!==null&&m.clipping!==true&&m.source_assets_preserved===true&&m.destructive_edit!==true;}

export function buildAudioPostDeliveryPackage({session={},assets=[],language="en",require_full_mix=true,listening_review=null}={}){
  const revision=Math.max(0,Math.round(finite(session.revision,0))),lang=text(language||"en")||"en",editorial=validateAudioPostSessionEditorial(session),manifest=buildProfessionalAudioDeliveryManifest(session),failures=[],warnings=[];
  if(!session.picture_lock?.picture_lock_digest)failures.push("AUDIO_POST_PICTURE_LOCK_REQUIRED");
  if(!editorial.success)failures.push(...editorial.failures);
  const postRolesPresent=(session.tracks||[]).some(track=>["DIALOGUE","VOICEOVER","ADR","MUSIC","EFFECTS","FOLEY","AMBIENCE"].includes(text(track.audio_role).toUpperCase()));
  const reRecordingMix=session.audio_post_mix?validateAudioPostMix(session):{success:false,contract:"AVANTIQO_AUDIO_POST_RERECORDING_MIX_VALIDATION_V1",failures:["AUDIO_POST_RERECORDING_MIX_POLICY_REQUIRED"],re_recording_mix_ready:false};
  if(postRolesPresent&&!reRecordingMix.success)failures.push(...reRecordingMix.failures);
  const languageClips=(session.tracks||[]).filter(t=>["DIALOGUE","VOICEOVER","ADR"].includes(text(t.audio_role).toUpperCase())).flatMap(t=>(t.clips||[]).map(c=>({track:t,clip:c,editorial:c.audio_post||{}})));
  const languageMismatches=languageClips.filter(x=>text(x.editorial.language||"und")!==lang&&text(x.editorial.language||"und")!=="und");
  if(languageMismatches.length)warnings.push("AUDIO_POST_MIXED_LANGUAGE_CLIPS_PRESENT");
  const unapproved=languageClips.filter(x=>x.editorial.dialogue_edit_approved!==true);
  if(unapproved.length)failures.push("AUDIO_POST_LANGUAGE_EDITORIAL_NOT_APPROVED");

  const expectedChannels=session.spatial_audio?.channel_count||2;
  const requiredStemDefs=manifest.stems.filter(stem=>stem.available&&stem.id!=="FULL_PROGRAM");
  const stemRows=requiredStemDefs.map(stem=>{
    const candidates=(assets||[]).filter(asset=>assetKind(asset)==="PROFESSIONAL_AUDIO_STEM"&&deliveryCode(asset)===stem.delivery_code&&currentAsset(asset,revision)&&(!isLanguageScopedPostStem(stem.id)||text(asset.metadata?.delivery_language).toLowerCase()===lang));
    const asset=candidates.sort((a,b)=>String(b.created_at||"").localeCompare(String(a.created_at||"")))[0]||null;
    const technical=asset?technicalStemOk(asset,expectedChannels):false;
    if(!asset)failures.push(`AUDIO_POST_REQUIRED_STEM_MISSING:${stem.delivery_code}`);
    else if(!technical)failures.push(`AUDIO_POST_REQUIRED_STEM_QC_FAILED:${stem.delivery_code}`);
    return{stem_id:stem.id,delivery_code:stem.delivery_code,label:stem.label,required:true,asset_id:asset?.id||null,current_revision:Boolean(asset),channels:asset?.metadata?.channels??null,channel_layout:asset?.metadata?.channel_layout??null,technical_qc_passed:technical,source_asset_ids:asset?.metadata?.source_asset_ids||[]};
  });

  const hasLanguageRoles=(session.tracks||[]).some(track=>["DIALOGUE","VOICEOVER","ADR"].includes(text(track.audio_role).toUpperCase()));
  const masters=(assets||[]).filter(asset=>["MASTER","SURROUND_MASTER"].includes(assetKind(asset))&&currentAsset(asset,revision)&&(!hasLanguageRoles||text(asset.metadata?.delivery_language).toLowerCase()===lang));
  const master=masters.find(a=>a?.metadata?.release_candidate===true)||masters[0]||null;
  if(require_full_mix&&!master)failures.push("AUDIO_POST_CURRENT_FULL_MIX_MASTER_REQUIRED");
  if(master&&master.metadata?.release_candidate!==true)failures.push("AUDIO_POST_FULL_MIX_NOT_RELEASE_CANDIDATE");
  if(master&&master.metadata?.technical_validation_passed===false)failures.push("AUDIO_POST_FULL_MIX_TECHNICAL_QC_FAILED");
  if(master&&assetKind(master)==="SURROUND_MASTER"&&master.metadata?.surround_validation_passed!==true)failures.push("AUDIO_POST_SURROUND_MASTER_QC_REQUIRED");

  const me=stemRows.find(row=>row.delivery_code==="ME")||null;
  if(manifest.me.required_for_audio_post&&manifest.stems.some(x=>x.available&&["MUSIC","EFFECTS","FOLEY","AMBIENCE"].includes(x.id))&&!me)failures.push("AUDIO_POST_ME_REQUIRED");
  const finalQc=evaluateAudioPostFinalQc({session,assets,language:lang});
  if(!finalQc.passed)failures.push(...finalQc.failures);
  const provisional={project_revision:revision,picture_lock_digest:session.picture_lock?.picture_lock_digest||null,language:lang,channel_layout:session.spatial_audio?.layout_id||"stereo",channels:expectedChannels,full_mix:{asset_id:master?.id||null},stems:stemRows};
  const listeningReview=finalQc.dialogue_intelligibility?.human_listening_review_required?evaluateAudioPostListeningReview(provisional,listening_review):{contract:"AVANTIQO_AUDIO_POST_DIALOGUE_LISTENING_STATUS_V1",required:false,current:true,approved:true,status:"NOT_REQUIRED"};
  if(listeningReview.required&&!listeningReview.approved)failures.push(listeningReview.status==="STALE"?"AUDIO_POST_DIALOGUE_LISTENING_REVIEW_STALE":"AUDIO_POST_DIALOGUE_LISTENING_REVIEW_REQUIRED");
  const uniqueFailures=[...new Set(failures)];
  const versionManifest=buildAudioPostLanguageVersionManifest({language:lang,picture_lock_digest:session.picture_lock?.picture_lock_digest,project_revision:revision,full_mix_asset_id:master?.id||null,stems:stemRows});
  return{contract:CONTRACT,engine_contract:"AVANTIQO_PROFESSIONAL_AUDIO_ENGINE_V1",project_revision:revision,picture_lock_digest:session.picture_lock?.picture_lock_digest||null,language:lang,language_version_manifest:versionManifest,listening_review:listeningReview,re_recording_mix:reRecordingMix,final_qc:finalQc,channel_layout:session.spatial_audio?.layout_id||"stereo",channels:expectedChannels,editorial,full_mix:{required:require_full_mix,asset_id:master?.id||null,kind:master?assetKind(master):null,release_candidate:master?.metadata?.release_candidate===true,technical_qc_passed:master?master.metadata?.technical_validation_passed!==false&&master.metadata?.surround_validation_passed!==false:false},stems:stemRows,me:{required:manifest.me.required_for_audio_post,asset_id:me?.asset_id||null,technical_qc_passed:me?.technical_qc_passed===true},warnings:[...new Set(warnings)],failures:uniqueFailures,release_ready:uniqueFailures.length===0,picture_lock_required:true,current_revision_only:true,editorial_approval_required:true,role_guessing_forbidden:true,original_sources_preserved:true};
}

export function sealAudioPostDeliveryPackage(packageState={},input={}){
  if(packageState.contract!==CONTRACT||packageState.release_ready!==true)throw new Error("CREATIVE_AUDIO_POST_DELIVERY_NOT_READY_TO_SEAL");
  const evidence={contract:"AVANTIQO_AUDIO_POST_DELIVERY_SEAL_V1",engine_contract:packageState.engine_contract,project_revision:packageState.project_revision,picture_lock_digest:packageState.picture_lock_digest,language:packageState.language,channel_layout:packageState.channel_layout,channels:packageState.channels,full_mix_asset_id:packageState.full_mix?.asset_id||null,stem_assets:(packageState.stems||[]).map(row=>({delivery_code:row.delivery_code,asset_id:row.asset_id,channels:row.channels,channel_layout:row.channel_layout,technical_qc_passed:row.technical_qc_passed})).sort((a,b)=>a.delivery_code.localeCompare(b.delivery_code)),me_asset_id:packageState.me?.asset_id||null,final_qc:{contract:packageState.final_qc?.contract||null,passed:packageState.final_qc?.passed===true,master_asset_id:packageState.final_qc?.master_asset_id||null,fold_down_passed:packageState.final_qc?.fold_down_qc?.passed===true,bwf_delivery_passed:packageState.final_qc?.bwf_delivery?.required?packageState.final_qc?.bwf_delivery?.master_passed===true:true,me_coherence_passed:packageState.final_qc?.me_coherence?.passed===true,language_version:packageState.final_qc?.language_version||null},listening_review:{contract:packageState.listening_review?.contract||null,status:packageState.listening_review?.status||null,approved:packageState.listening_review?.approved===true,current:packageState.listening_review?.current===true,binding_hash:packageState.listening_review?.binding_hash||null,reviewed_at:packageState.listening_review?.reviewed_at||null,reviewer_user_id:packageState.listening_review?.reviewer_user_id||null},release_ready:true};
  const manifest_hash=crypto.createHash("sha256").update(JSON.stringify(evidence)).digest("hex");
  return{...evidence,manifest_hash,sealed_at:text(input.sealed_at)||new Date().toISOString(),sealed_by_user_id:text(input.sealed_by_user_id)||null,immutable_evidence:true,audio_mutation_performed:false,provider_job_submitted:false};
}

export const CreativeAudioPostDeliveryRuntime=Object.freeze({contract:CONTRACT,build:buildAudioPostDeliveryPackage,seal:sealAudioPostDeliveryPackage});
