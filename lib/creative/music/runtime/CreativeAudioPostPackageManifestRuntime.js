import crypto from "node:crypto";

const CONTRACT="AVANTIQO_AUDIO_POST_PACKAGE_MANIFEST_V1";
const LANGUAGE_CODES=new Set(["DX","VO","ADR"]);
function text(v){return String(v??"").trim();}
function safe(v,f="audio-post"){return text(v||f).normalize("NFKD").replace(/[^A-Za-z0-9._-]+/g,"-").replace(/-+/g,"-").replace(/^-+|-+$/g,"").slice(0,100)||f;}
function ext(asset){const name=text(asset?.file_name||asset?.name).toLowerCase();const match=name.match(/\.([a-z0-9]{2,8})$/);return match?.[1]||"wav";}
function digest(value){return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");}
export function buildAudioPostPackageManifest({project={},seal={},assets=[]}={}){
 if(seal.contract!=="AVANTIQO_AUDIO_POST_DELIVERY_SEAL_V1"||seal.release_ready!==true)throw new Error("CREATIVE_AUDIO_POST_PACKAGE_SEAL_REQUIRED");
 const byId=new Map((assets||[]).map(asset=>[text(asset.id),asset])),base=safe(project.name||project.title||"audio-post"),lang=safe(seal.language||"und"),layout=safe(seal.channel_layout||"stereo"),revision=Number(seal.project_revision)||0,files=[];
 const full=byId.get(text(seal.full_mix_asset_id));if(!full)throw new Error("CREATIVE_AUDIO_POST_PACKAGE_FULL_MIX_ASSET_REQUIRED");
 files.push({kind:"FULL_MIX",scope:"LANGUAGE",delivery_code:"FULLMIX",language:seal.language,asset_id:full.id,source_file_url:full.file_url||null,source_file_name:full.file_name||null,delivery_path:`languages/${lang}/${base}_r${revision}_${lang}_FULLMIX_${layout}.${ext(full)}`});
 for(const row of seal.stem_assets||[]){const code=text(row.delivery_code).toUpperCase(),asset=byId.get(text(row.asset_id));if(!asset)throw new Error(`CREATIVE_AUDIO_POST_PACKAGE_STEM_ASSET_REQUIRED:${code}`);const languageScoped=LANGUAGE_CODES.has(code);files.push({kind:"STEM",scope:languageScoped?"LANGUAGE":"SHARED",delivery_code:code,language:languageScoped?seal.language:null,asset_id:asset.id,source_file_url:asset.file_url||null,source_file_name:asset.file_name||null,delivery_path:languageScoped?`languages/${lang}/${base}_r${revision}_${lang}_${safe(code)}_${layout}.${ext(asset)}`:`shared/${base}_r${revision}_SHARED_${safe(code)}_${layout}.${ext(asset)}`});}
 const canonicalFiles=files.sort((a,b)=>a.delivery_path.localeCompare(b.delivery_path));const evidence={contract:CONTRACT,delivery_seal_hash:seal.manifest_hash,delivery_profile_id:seal.delivery_profile_id||null,project_id:project.id||project.creative_project_id||null,project_revision:revision,picture_lock_digest:seal.picture_lock_digest,language:seal.language,channel_layout:seal.channel_layout,channels:seal.channels,full_mix_asset_id:seal.full_mix_asset_id,me_asset_id:seal.me_asset_id||null,files:canonicalFiles,shared_assets_referenced_once:true,audio_files_copied:false,file_integrity_algorithm:"sha256",file_integrity_materialized:false};
 return{...evidence,package_manifest_hash:digest(evidence),manifest_file_name:`${base}_r${revision}_${lang}_audio-post-manifest.json`,root_folder:`${base}_r${revision}_audio-post`,created_from_immutable_seal:true};
}
export const CreativeAudioPostPackageManifestRuntime=Object.freeze({contract:CONTRACT,build:buildAudioPostPackageManifest});
