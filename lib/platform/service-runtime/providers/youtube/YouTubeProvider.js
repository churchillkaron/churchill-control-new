import { CredentialRuntime } from "../../credentials/runtime/CredentialRuntime.js";
import { deactivateOtherActiveScopedCredentials } from "../../credentials/repositories/CredentialRepository.js";
import { supabaseAdmin } from "../../../../shared/supabase/admin.js";
import "./YouTubeCredentialRegistration.js";

const API="https://www.googleapis.com/youtube/v3";
const UPLOAD="https://www.googleapis.com/upload/youtube/v3/videos";
const MAX_VIDEO_BYTES=512*1024*1024;
function text(value){ return String(value ?? "").trim(); }
function object(value){ return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function isExpired(input){ const ts=Date.parse(text(input.expires_at)); return Number.isFinite(ts) && ts-Date.now()<60_000; }
function isPrivateHostname(hostname){
  const host=text(hostname).toLowerCase();
  if(!host || host==="localhost" || host.endsWith(".local") || host==="127.0.0.1" || host==="::1") return true;
  const p=host.split(".").map(Number); if(p.length===4 && p.every(Number.isFinite)){ const [a,b]=p; if(a===10||a===127||a===0||(a===169&&b===254)||(a===192&&b===168)||(a===172&&b>=16&&b<=31)) return true; }
  return false;
}
async function refreshAccessToken(input){
  const refreshToken=text(input.refresh_token); const org=text(input.context?.organization_id); const oldId=text(input.credential_id);
  if(!refreshToken || !org || !oldId) throw new Error("YOUTUBE_REFRESH_CONTEXT_REQUIRED");
  const clientId=text(process.env.GOOGLE_CLIENT_ID); const clientSecret=text(process.env.GOOGLE_CLIENT_SECRET);
  if(!clientId || !clientSecret) throw new Error("YOUTUBE_GOOGLE_OAUTH_CONFIG_REQUIRED");
  const response=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:refreshToken,grant_type:"refresh_token"}),cache:"no-store"});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok || !text(payload.access_token)) throw new Error(payload.error_description || payload.error || "YOUTUBE_TOKEN_REFRESH_FAILED");
  const expiresAt=new Date(Date.now()+(Number(payload.expires_in)||3600)*1000).toISOString();
  const secret={access_token:payload.access_token,refresh_token:refreshToken,expires_at:expiresAt,scope:payload.scope||input.scope||null,token_type:payload.token_type||"Bearer"};
  const credential=await CredentialRuntime.storeSecret({provider_id:"youtube",credential_type:"oauth_token",secret:JSON.stringify(secret),organization_id:org,vault_name:`youtube-oauth-${org}-${Date.now()}`,vault_description:"Rotated organization YouTube OAuth credential",metadata:{organization_id:org,purpose:"ORGANIZATION_YOUTUBE_CONNECTION",enabled:true,channel_id:input.channel_id||null,channel_title:input.channel_title||null,token_refreshed_at:new Date().toISOString()}});
  await deactivateOtherActiveScopedCredentials({provider_id:"youtube",organization_id:org,purpose:"ORGANIZATION_YOUTUBE_CONNECTION",except_id:credential.id});
  await supabaseAdmin.from("organization_channel_connections").update({credentials_reference:credential.id,updated_at:new Date().toISOString()}).eq("organization_id",org).eq("provider","youtube").eq("credentials_reference",oldId);
  return payload.access_token;
}
async function withAccessToken(input, operation){
  let token=text(input.access_token); if(!token) throw new Error("YOUTUBE_ACCESS_TOKEN_REQUIRED");
  if(isExpired(input) && text(input.refresh_token)) token=await refreshAccessToken(input);
  try { return await operation(token); } catch(error){ if(Number(error?.status)!==401 || !text(input.refresh_token)) throw error; token=await refreshAccessToken(input); return operation(token); }
}
async function jsonRequest(url,token,options={}){
  const response=await fetch(url,{...options,headers:{Authorization:`Bearer ${token}`,...(options.headers||{})},cache:"no-store"});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok){ const error=new Error(payload?.error?.message || `YOUTUBE_REQUEST_FAILED:${response.status}`); error.status=response.status; throw error; }
  return payload;
}
async function fetchVideo(urlValue){
  let url; try{ url=new URL(text(urlValue)); }catch{ throw new Error("YOUTUBE_VIDEO_URL_INVALID"); }
  if(url.protocol!=="https:" || isPrivateHostname(url.hostname)) throw new Error("YOUTUBE_VIDEO_URL_HTTPS_PUBLIC_REQUIRED");
  const response=await fetch(url,{cache:"no-store",redirect:"follow",headers:{"Accept-Encoding":"identity"}});
  if(!response.ok) throw new Error(`YOUTUBE_VIDEO_FETCH_FAILED:${response.status}`);
  const type=text(response.headers.get("content-type")).split(";")[0].toLowerCase();
  if(!type.startsWith("video/") && type!=="application/octet-stream") throw new Error("YOUTUBE_VIDEO_CONTENT_TYPE_INVALID");
  const declared=Number(response.headers.get("content-length")); if(Number.isFinite(declared) && declared>MAX_VIDEO_BYTES) throw new Error("YOUTUBE_VIDEO_TOO_LARGE_FOR_AVANTIQO_UPLOAD");
  const buffer=Buffer.from(await response.arrayBuffer()); if(!buffer.length) throw new Error("YOUTUBE_VIDEO_EMPTY"); if(buffer.length>MAX_VIDEO_BYTES) throw new Error("YOUTUBE_VIDEO_TOO_LARGE_FOR_AVANTIQO_UPLOAD");
  return {buffer,type:type||"video/mp4"};
}
async function publish(input,token){
  const videoUrl=text(input.video_url || input.media_url); if(!videoUrl) throw new Error("YOUTUBE_VIDEO_URL_REQUIRED");
  const title=text(input.title || input.caption || input.text).slice(0,100); if(!title) throw new Error("YOUTUBE_TITLE_REQUIRED");
  const privacy=new Set(["private","unlisted","public"]).has(text(input.privacy_status).toLowerCase()) ? text(input.privacy_status).toLowerCase() : "private";
  const media=await fetchVideo(videoUrl);
  const metadata={snippet:{title,description:text(input.description || input.caption).slice(0,5000),...(Array.isArray(input.tags)&&input.tags.length?{tags:input.tags.map(text).filter(Boolean).slice(0,500)}:{}),categoryId:text(input.category_id || "22")},status:{privacyStatus:privacy,selfDeclaredMadeForKids:input.made_for_kids===true}};
  const initUrl=new URL(UPLOAD); initUrl.searchParams.set("uploadType","resumable"); initUrl.searchParams.set("part","snippet,status");
  const init=await fetch(initUrl,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json; charset=UTF-8","X-Upload-Content-Length":String(media.buffer.length),"X-Upload-Content-Type":media.type},body:JSON.stringify(metadata),cache:"no-store"});
  if(!init.ok){ const payload=await init.json().catch(()=>({})); const error=new Error(payload?.error?.message || `YOUTUBE_UPLOAD_INIT_FAILED:${init.status}`); error.status=init.status; throw error; }
  const location=init.headers.get("location"); if(!location) throw new Error("YOUTUBE_RESUMABLE_UPLOAD_LOCATION_MISSING");
  const upload=await fetch(location,{method:"PUT",headers:{"Content-Type":media.type,"Content-Length":String(media.buffer.length)},body:media.buffer,cache:"no-store"});
  const result=await upload.json().catch(()=>({})); if(!upload.ok){ const error=new Error(result?.error?.message || `YOUTUBE_UPLOAD_FAILED:${upload.status}`); error.status=upload.status; throw error; }
  return {success:true,provider:"youtube",output:{id:text(result.id)||null,title,privacy_status:privacy,url:result.id?`https://www.youtube.com/watch?v=${encodeURIComponent(result.id)}`:null}};
}
async function analytics(token){
  const url=new URL(`${API}/channels`); url.searchParams.set("part","snippet,statistics"); url.searchParams.set("mine","true");
  const payload=await jsonRequest(url,token); return {success:true,provider:"youtube",output:{channels:Array.isArray(payload.items)?payload.items:[]}};
}
export const YouTubeProvider={id:"youtube",async execute(input={}){ if(input.capability==="marketing.youtube.publish") return withAccessToken(input,(token)=>publish(input,token)); if(input.capability==="marketing.youtube.analytics") return withAccessToken(input,(token)=>analytics(token)); throw new Error(`YouTube capability not supported: ${input.capability}`); }};
