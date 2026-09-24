import { CredentialRuntime } from "../../credentials/runtime/CredentialRuntime.js";
import { deactivateOtherActiveScopedCredentials } from "../../credentials/repositories/CredentialRepository.js";
import { supabaseAdmin } from "../../../../shared/supabase/admin.js";
import "./PinterestCredentialRegistration.js";

const API="https://api.pinterest.com/v5";
function text(value){ return String(value ?? "").trim(); }
function object(value){ return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function expiring(value){ const ts=Date.parse(text(value)); return Number.isFinite(ts) && ts-Date.now()<5*60_000; }
function publicHttps(value){ try{ const url=new URL(text(value)); if(url.protocol!=="https:") return null; const h=url.hostname.toLowerCase(); if(!h||h==="localhost"||h.endsWith(".local")||h==="127.0.0.1"||h==="::1") return null; const p=h.split(".").map(Number); if(p.length===4&&p.every(Number.isFinite)){const[a,b]=p;if(a===10||a===127||a===0||(a===169&&b===254)||(a===192&&b===168)||(a===172&&b>=16&&b<=31)) return null;} return url.toString(); }catch{return null;} }
function basic(){ const id=text(process.env.PINTEREST_APP_ID); const secret=text(process.env.PINTEREST_APP_SECRET); if(!id||!secret) throw new Error("PINTEREST_APP_CREDENTIALS_REQUIRED"); return `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`; }
async function rotate(input){
  const refresh=text(input.refresh_token); const org=text(input.context?.organization_id); const oldId=text(input.credential_id); if(!refresh||!org||!oldId) throw new Error("PINTEREST_REFRESH_CONTEXT_REQUIRED");
  const response=await fetch(`${API}/oauth/token`,{method:"POST",headers:{Authorization:basic(),"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"refresh_token",refresh_token:refresh}),cache:"no-store"});
  const payload=await response.json().catch(()=>({})); if(!response.ok||!text(payload.access_token)) throw new Error(payload?.message||payload?.error||"PINTEREST_TOKEN_REFRESH_FAILED");
  const now=Date.now(); const nextRefresh=text(payload.refresh_token)||refresh;
  const secret={access_token:payload.access_token,refresh_token:nextRefresh,expires_at:new Date(now+(Number(payload.expires_in)||2592000)*1000).toISOString(),refresh_token_expires_at:payload.refresh_token_expires_at?new Date(Number(payload.refresh_token_expires_at)*1000).toISOString():input.refresh_token_expires_at||null,scope:payload.scope||input.scope||null,token_type:payload.token_type||"bearer"};
  const credential=await CredentialRuntime.storeSecret({provider_id:"pinterest",credential_type:"oauth_token",secret:JSON.stringify(secret),organization_id:org,vault_name:`pinterest-oauth-${org}-${Date.now()}`,vault_description:"Rotated organization Pinterest OAuth credential",metadata:{organization_id:org,purpose:"ORGANIZATION_PINTEREST_CONNECTION",enabled:true,username:input.username||null,account_type:input.account_type||null,token_refreshed_at:new Date().toISOString()}});
  await deactivateOtherActiveScopedCredentials({provider_id:"pinterest",organization_id:org,purpose:"ORGANIZATION_PINTEREST_CONNECTION",except_id:credential.id});
  await supabaseAdmin.from("organization_channel_connections").update({credentials_reference:credential.id,updated_at:new Date().toISOString()}).eq("organization_id",org).eq("provider","pinterest").eq("credentials_reference",oldId);
  return payload.access_token;
}
async function request(url,token,options={}){ const response=await fetch(url,{...options,headers:{Authorization:`Bearer ${token}`,...(options.headers||{})},cache:"no-store"}); const payload=await response.json().catch(()=>({})); if(!response.ok){const error=new Error(payload?.message||payload?.error?.message||`PINTEREST_REQUEST_FAILED:${response.status}`);error.status=response.status;throw error;} return payload; }
async function withToken(input,fn){ let token=text(input.access_token); if(!token) throw new Error("PINTEREST_ACCESS_TOKEN_REQUIRED"); if(expiring(input.expires_at)&&text(input.refresh_token)) token=await rotate(input); try{return await fn(token);}catch(error){if(Number(error?.status)!==401||!text(input.refresh_token)) throw error; token=await rotate(input); return fn(token);} }
async function publish(input,token){
  const boardId=text(input.board_id||input.boardId); if(!boardId) throw new Error("PINTEREST_BOARD_ID_REQUIRED");
  const imageUrl=publicHttps(input.image_url||input.media_url); if(!imageUrl) throw new Error("PINTEREST_PUBLIC_HTTPS_IMAGE_REQUIRED");
  const body={board_id:boardId,media_source:{source_type:"image_url",url:imageUrl},...(text(input.title)?{title:text(input.title).slice(0,100)}:{}),...(text(input.description||input.caption)?{description:text(input.description||input.caption).slice(0,800)}:{}),...(publicHttps(input.link)?{link:publicHttps(input.link)}:{})};
  const result=await request(`${API}/pins`,token,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  return {success:true,provider:"pinterest",output:{id:text(result.id)||null,board_id:boardId,title:text(result.title)||text(input.title)||null,link:text(result.link)||null}};
}
async function boards(token){ const url=new URL(`${API}/boards`); url.searchParams.set("page_size","100"); const result=await request(url,token); return {success:true,provider:"pinterest",output:{boards:Array.isArray(result.items)?result.items:[],bookmark:text(result.bookmark)||null}}; }
export const PinterestProvider={id:"pinterest",async execute(input={}){ if(input.capability==="marketing.pinterest.publish") return withToken(input,(token)=>publish(input,token)); if(input.capability==="marketing.pinterest.boards.read") return withToken(input,(token)=>boards(token)); throw new Error(`Pinterest capability not supported: ${input.capability}`); }};
