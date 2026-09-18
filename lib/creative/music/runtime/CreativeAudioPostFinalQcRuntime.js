const CONTRACT="AVANTIQO_AUDIO_POST_FINAL_QC_V1";
function text(v){return String(v??"").trim();}function finite(v,f=null){const n=Number(v);return Number.isFinite(n)?n:f;}
function durationOf(asset){return finite(asset?.metadata?.render_duration_seconds,finite(asset?.metadata?.duration_seconds,finite(asset?.metadata?.surround_technical_validation?.observed?.duration_seconds,null)));}
function layoutOf(asset){return text(asset?.metadata?.channel_layout||asset?.metadata?.surround_technical_validation?.expected?.layout_id||"")||null;}
function channelsOf(asset){return Math.round(finite(asset?.metadata?.channels,asset?.metadata?.surround_technical_validation?.expected?.channels||0));}
function current(asset,revision){return Math.round(finite(asset?.metadata?.project_revision,-1))===Math.round(finite(revision,0));}
function code(asset){return text(asset?.metadata?.professional_audio_delivery_code).toUpperCase();}
function kind(asset){return text(asset?.metadata?.music_asset_kind).toUpperCase();}

export function evaluateAudioPostFinalQc({session={},assets=[],language="en",duration_tolerance_seconds=.05}={}){
  const revision=Math.max(0,Math.round(finite(session.revision,0))),expectedLayout=session.spatial_audio?.layout_id||"stereo",expectedChannels=Math.round(finite(session.spatial_audio?.channel_count,2)),lang=text(language||"en")||"en",failures=[],warnings=[];
  const currentAssets=(assets||[]).filter(asset=>current(asset,revision));
  const stems=currentAssets.filter(asset=>kind(asset)==="PROFESSIONAL_AUDIO_STEM");
  const stemByCode=new Map(stems.map(asset=>[code(asset),asset]));
  const master=currentAssets.find(asset=>["SURROUND_MASTER","MASTER"].includes(kind(asset))&&asset.metadata?.release_candidate===true)||null;
  if(!master)failures.push("AUDIO_POST_FINAL_QC_MASTER_REQUIRED");
  const referenceDuration=master?durationOf(master):Math.max(0,...stems.map(durationOf).filter(Number.isFinite));
  const durationRows=[];
  for(const asset of stems){const d=durationOf(asset),delta=Number.isFinite(d)&&Number.isFinite(referenceDuration)?Math.abs(d-referenceDuration):null,passed=Number.isFinite(delta)&&delta<=duration_tolerance_seconds;if(!passed)failures.push(`AUDIO_POST_STEM_DURATION_MISMATCH:${code(asset)}`);durationRows.push({delivery_code:code(asset),asset_id:asset.id,duration_seconds:d,delta_seconds:delta,passed});}
  const formatRows=[];
  for(const asset of stems){const layout=layoutOf(asset),channels=channelsOf(asset),passed=layout===expectedLayout&&channels===expectedChannels;if(!passed)failures.push(`AUDIO_POST_STEM_FORMAT_MISMATCH:${code(asset)}`);formatRows.push({delivery_code:code(asset),asset_id:asset.id,layout,channels,passed});}
  let foldDown={required:expectedChannels>2,passed:true,evidence:null};
  if(master&&expectedChannels>2){const evidence=master.metadata?.surround_technical_validation||master.metadata?.surround_validation||null;const stereo=evidence?.observed?.stereo_downmix||null,mono=evidence?.observed?.mono_downmix||null;const passed=Boolean(evidence?.passed)&&finite(stereo?.true_peak_dbtp,null)!==null&&finite(stereo.true_peak_dbtp)<=-0.1;if(!passed)failures.push("AUDIO_POST_FOLD_DOWN_QC_REQUIRED");foldDown={required:true,passed,evidence:{stereo_downmix:stereo,mono_downmix:mono}};}
  const languageTracks=(session.tracks||[]).filter(track=>["DIALOGUE","VOICEOVER","ADR"].includes(text(track.audio_role).toUpperCase()));
  const languageClips=languageTracks.flatMap(track=>(track.clips||[]).map(clip=>({track_id:track.id,role:track.audio_role,clip_id:clip.id,language:text(clip.audio_post?.language||"und"),approved:clip.audio_post?.dialogue_edit_approved===true})));
  const languageMismatches=languageClips.filter(row=>row.language!==lang&&row.language!=="und");if(languageMismatches.length)failures.push("AUDIO_POST_LANGUAGE_VERSION_MISMATCH");
  const unapproved=languageClips.filter(row=>row.approved!==true);if(unapproved.length)failures.push("AUDIO_POST_LANGUAGE_EDITORIAL_NOT_APPROVED");
  const dxPresent=languageTracks.some(track=>text(track.audio_role).toUpperCase()==="DIALOGUE"),voPresent=languageTracks.some(track=>text(track.audio_role).toUpperCase()==="VOICEOVER"),adrPresent=languageTracks.some(track=>text(track.audio_role).toUpperCase()==="ADR");
  if(dxPresent&&!stemByCode.has("DX"))failures.push("AUDIO_POST_DX_STEM_REQUIRED");if(voPresent&&!stemByCode.has("VO"))failures.push("AUDIO_POST_VO_STEM_REQUIRED");if(adrPresent&&!stemByCode.has("ADR"))failures.push("AUDIO_POST_ADR_STEM_REQUIRED");
  const meRequired=(session.tracks||[]).some(track=>["MUSIC","EFFECTS","FOLEY","AMBIENCE"].includes(text(track.audio_role).toUpperCase()));if(meRequired&&!stemByCode.has("ME"))failures.push("AUDIO_POST_ME_STEM_REQUIRED");
  const me=stemByCode.get("ME")||null;if(me){const meSources=new Set(me.metadata?.source_asset_ids||[]),componentCodes=["MX","FX","FOL","AMB"],missing=[];for(const c of componentCodes){const component=stemByCode.get(c);if(!component)continue;for(const sourceId of component.metadata?.source_asset_ids||[])if(!meSources.has(sourceId))missing.push({delivery_code:c,source_asset_id:sourceId});}if(missing.length)failures.push("AUDIO_POST_ME_SOURCE_COHERENCE_FAILED");}
  const dialogueIntelligibility={automatic_semantic_claim:false,technical_prerequisites_passed:languageClips.length===0||(!unapproved.length&&!languageMismatches.length),human_listening_review_required:languageClips.length>0};if(languageClips.length)warnings.push("AUDIO_POST_DIALOGUE_INTELLIGIBILITY_LISTENING_REVIEW_REQUIRED");
  const uniqueFailures=[...new Set(failures)];
  return{contract:CONTRACT,passed:uniqueFailures.length===0,release_qc_ready:uniqueFailures.length===0,project_revision:revision,language:lang,expected_layout:expectedLayout,expected_channels:expectedChannels,master_asset_id:master?.id||null,reference_duration_seconds:referenceDuration,duration_tolerance_seconds:duration_tolerance_seconds,duration_alignment:durationRows,format_alignment:formatRows,fold_down_qc:foldDown,language_version:{clip_count:languageClips.length,mismatch_count:languageMismatches.length,unapproved_count:unapproved.length},me_coherence:{required:meRequired,asset_id:me?.id||null,source_coherence_checked:Boolean(me),passed:!uniqueFailures.includes("AUDIO_POST_ME_SOURCE_COHERENCE_FAILED")},dialogue_intelligibility:dialogueIntelligibility,failures:uniqueFailures,warnings:[...new Set(warnings)],actual_rendered_asset_metadata_is_authority:true,provider_job_submitted:false,artistic_acceptance_performed:false};
}
export const CreativeAudioPostFinalQcRuntime=Object.freeze({contract:CONTRACT,evaluate:evaluateAudioPostFinalQc});
