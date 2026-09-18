import { validateAudioPostSessionEditorial } from "./CreativeAudioPostEditorialRuntime.js";
import { buildProfessionalAudioDeliveryManifest } from "./CreativeProfessionalAudioEngineRuntime.js";

const CONTRACT="AVANTIQO_AUDIO_POST_DELIVERY_PACKAGE_V1";
function text(v){return String(v??"").trim();}function finite(v,f=null){const n=Number(v);return Number.isFinite(n)?n:f;}
function currentAsset(asset,revision){return Math.round(finite(asset?.metadata?.project_revision,-1))===Math.round(finite(revision,0));}
function assetKind(asset){return text(asset?.metadata?.music_asset_kind||asset?.asset_type||asset?.kind).toUpperCase();}
function deliveryCode(asset){return text(asset?.metadata?.professional_audio_delivery_code).toUpperCase();}
function technicalStemOk(asset,expectedChannels){const m=asset?.metadata||{};return currentAsset(asset,m.project_revision)&&Math.round(finite(m.channels,-1))===Math.round(expectedChannels)&&finite(m.peak_dbfs,null)!==null&&finite(m.rms_dbfs,null)!==null&&m.clipping!==true&&m.source_assets_preserved===true&&m.destructive_edit!==true;}

export function buildAudioPostDeliveryPackage({session={},assets=[],language="en",require_full_mix=true}={}){
  const revision=Math.max(0,Math.round(finite(session.revision,0))),lang=text(language||"en")||"en",editorial=validateAudioPostSessionEditorial(session),manifest=buildProfessionalAudioDeliveryManifest(session),failures=[],warnings=[];
  if(!session.picture_lock?.picture_lock_digest)failures.push("AUDIO_POST_PICTURE_LOCK_REQUIRED");
  if(!editorial.success)failures.push(...editorial.failures);
  const languageClips=(session.tracks||[]).filter(t=>["DIALOGUE","VOICEOVER","ADR"].includes(text(t.audio_role).toUpperCase())).flatMap(t=>(t.clips||[]).map(c=>({track:t,clip:c,editorial:c.audio_post||{}})));
  const languageMismatches=languageClips.filter(x=>text(x.editorial.language||"und")!==lang&&text(x.editorial.language||"und")!=="und");
  if(languageMismatches.length)warnings.push("AUDIO_POST_MIXED_LANGUAGE_CLIPS_PRESENT");
  const unapproved=languageClips.filter(x=>x.editorial.dialogue_edit_approved!==true);
  if(unapproved.length)failures.push("AUDIO_POST_LANGUAGE_EDITORIAL_NOT_APPROVED");

  const expectedChannels=session.spatial_audio?.channel_count||2;
  const requiredStemDefs=manifest.stems.filter(stem=>stem.available&&stem.id!=="FULL_PROGRAM");
  const stemRows=requiredStemDefs.map(stem=>{
    const candidates=(assets||[]).filter(asset=>assetKind(asset)==="PROFESSIONAL_AUDIO_STEM"&&deliveryCode(asset)===stem.delivery_code&&currentAsset(asset,revision));
    const asset=candidates.sort((a,b)=>String(b.created_at||"").localeCompare(String(a.created_at||"")))[0]||null;
    const technical=asset?technicalStemOk(asset,expectedChannels):false;
    if(!asset)failures.push(`AUDIO_POST_REQUIRED_STEM_MISSING:${stem.delivery_code}`);
    else if(!technical)failures.push(`AUDIO_POST_REQUIRED_STEM_QC_FAILED:${stem.delivery_code}`);
    return{stem_id:stem.id,delivery_code:stem.delivery_code,label:stem.label,required:true,asset_id:asset?.id||null,current_revision:Boolean(asset),channels:asset?.metadata?.channels??null,channel_layout:asset?.metadata?.channel_layout??null,technical_qc_passed:technical,source_asset_ids:asset?.metadata?.source_asset_ids||[]};
  });

  const masters=(assets||[]).filter(asset=>["MASTER","SURROUND_MASTER"].includes(assetKind(asset))&&currentAsset(asset,revision));
  const master=masters.find(a=>a?.metadata?.release_candidate===true)||masters[0]||null;
  if(require_full_mix&&!master)failures.push("AUDIO_POST_CURRENT_FULL_MIX_MASTER_REQUIRED");
  if(master&&master.metadata?.release_candidate!==true)failures.push("AUDIO_POST_FULL_MIX_NOT_RELEASE_CANDIDATE");
  if(master&&master.metadata?.technical_validation_passed===false)failures.push("AUDIO_POST_FULL_MIX_TECHNICAL_QC_FAILED");
  if(master&&assetKind(master)==="SURROUND_MASTER"&&master.metadata?.surround_validation_passed!==true)failures.push("AUDIO_POST_SURROUND_MASTER_QC_REQUIRED");

  const me=stemRows.find(row=>row.delivery_code==="ME")||null;
  if(manifest.me.required_for_audio_post&&manifest.stems.some(x=>x.available&&["MUSIC","EFFECTS","FOLEY","AMBIENCE"].includes(x.id))&&!me)failures.push("AUDIO_POST_ME_REQUIRED");
  const uniqueFailures=[...new Set(failures)];
  return{contract:CONTRACT,engine_contract:"AVANTIQO_PROFESSIONAL_AUDIO_ENGINE_V1",project_revision:revision,picture_lock_digest:session.picture_lock?.picture_lock_digest||null,language:lang,channel_layout:session.spatial_audio?.layout_id||"stereo",channels:expectedChannels,editorial,full_mix:{required:require_full_mix,asset_id:master?.id||null,kind:master?assetKind(master):null,release_candidate:master?.metadata?.release_candidate===true,technical_qc_passed:master?master.metadata?.technical_validation_passed!==false&&master.metadata?.surround_validation_passed!==false:false},stems:stemRows,me:{required:manifest.me.required_for_audio_post,asset_id:me?.asset_id||null,technical_qc_passed:me?.technical_qc_passed===true},warnings:[...new Set(warnings)],failures:uniqueFailures,release_ready:uniqueFailures.length===0,picture_lock_required:true,current_revision_only:true,editorial_approval_required:true,role_guessing_forbidden:true,original_sources_preserved:true};
}
export const CreativeAudioPostDeliveryRuntime=Object.freeze({contract:CONTRACT,build:buildAudioPostDeliveryPackage});
