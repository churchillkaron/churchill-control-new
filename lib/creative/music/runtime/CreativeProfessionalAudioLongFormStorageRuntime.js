const CONTRACT="AVANTIQO_PROFESSIONAL_AUDIO_LONG_FORM_STORAGE_V1";
const DIRECT_LIMIT_BYTES=64*1024*1024;
const TUS_CHUNK_BYTES=6*1024*1024;
function finite(v,f=0){const n=Number(v);return Number.isFinite(n)?n:f;}
export function planProfessionalAudioLongFormStorage({size_bytes=0}={}){const size=Math.max(0,Math.ceil(finite(size_bytes,0))),resumable=size>DIRECT_LIMIT_BYTES;return{contract:CONTRACT,size_bytes:size,transport:resumable?"TUS_RESUMABLE":"SIGNED_PUT",resumable_required:resumable,direct_put_limit_bytes:DIRECT_LIMIT_BYTES,tus_chunk_bytes:TUS_CHUNK_BYTES,service_role_on_worker:false,signed_upload_token_required:true,resume_supported:resumable};}
export function directStorageHostname(projectUrl){const url=new URL(projectUrl);if(/\.supabase\.(co|in|red)$/i.test(url.hostname)&&!url.hostname.includes(".storage.supabase."))url.hostname=url.hostname.replace(".supabase.",".storage.supabase.");return url.origin;}
export function tusUploadMetadata({bucket_name,object_name,content_type="audio/wav",cache_control="3600"}={}){const enc=v=>Buffer.from(String(v??""),"utf8").toString("base64");return[["bucketName",bucket_name],["objectName",object_name],["contentType",content_type],["cacheControl",cache_control]].map(([k,v])=>`${k} ${enc(v)}`).join(",");}
export const CreativeProfessionalAudioLongFormStorageRuntime=Object.freeze({contract:CONTRACT,plan:planProfessionalAudioLongFormStorage,directStorageHostname,tusUploadMetadata});
