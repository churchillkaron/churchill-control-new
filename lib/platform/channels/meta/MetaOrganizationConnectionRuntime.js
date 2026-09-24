import crypto from "node:crypto";
import { CredentialRuntime } from "@/lib/platform/service-runtime/credentials/runtime/CredentialRuntime";
import { ChannelConnectionRuntime } from "@/lib/platform/channels/runtime/ChannelConnectionRuntime";
import { ChannelAssetRuntime } from "@/lib/platform/channels/runtime/ChannelAssetRuntime";
import { inspectMetaMessagingAccess } from "@/lib/platform/service-runtime/providers/meta/MetaMessagingAccessDiagnosticRuntime";

function text(value) { return String(value ?? "").trim(); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function graphVersion() {
  const configured = text(process.env.META_GRAPH_API_VERSION || process.env.META_GRAPH_VERSION || "v24.0");
  return configured.startsWith("v") ? configured : `v${configured}`;
}
async function graphJson(url, options = {}) {
  const response = await fetch(url, { cache:"no-store", ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.error) throw new Error(payload?.error?.error_user_msg || payload?.error?.message || `Meta request failed (${response.status})`);
  return payload;
}
function appAccessToken() {
  if (!process.env.META_APP_ID || !process.env.META_APP_SECRET) throw new Error("Meta application credentials are not configured");
  return `${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`;
}
function webhookVerifyToken() {
  const configured = text(process.env.META_MESSAGING_WEBHOOK_VERIFY_TOKEN);
  if (configured) return configured;
  const secret = text(process.env.META_APP_SECRET);
  if (!secret) throw new Error("Meta application secret is not configured");
  return crypto.createHash("sha256").update(`avantiqo:meta-messaging-webhook:${secret}`).digest("hex");
}
async function configureSubscription({objectType,fields,origin}) {
  const url = new URL(`https://graph.facebook.com/${graphVersion()}/${process.env.META_APP_ID}/subscriptions`);
  url.searchParams.set("object", objectType);
  url.searchParams.set("callback_url", `${origin}/api/commercial/communications/webhooks/meta`);
  url.searchParams.set("verify_token", webhookVerifyToken());
  url.searchParams.set("fields", fields.join(","));
  url.searchParams.set("access_token", appAccessToken());
  const result = await graphJson(url,{method:"POST"});
  if (result?.success !== true && result?.success !== "true") throw new Error(`Meta ${objectType} webhook configuration failed`);
  return {object_type:objectType,fields};
}
async function configureMessagingWebhooks(origin) {
  const page = await configureSubscription({objectType:"page",origin,fields:["messages","messaging_postbacks","message_deliveries","message_reads"]});
  const instagram = await configureSubscription({objectType:"instagram",origin,fields:["messages","messaging_postbacks"]});
  return {page,instagram};
}
async function subscribePageMessaging(page) {
  const url = new URL(`https://graph.facebook.com/${graphVersion()}/${page.id}/subscribed_apps`);
  url.searchParams.set("subscribed_fields","messages,messaging_postbacks,message_deliveries,message_reads");
  url.searchParams.set("access_token",page.access_token);
  const result=await graphJson(url,{method:"POST"});
  if(result?.success!==true && result?.success!=="true") throw new Error(`Meta messaging webhook subscription failed for ${page.name || page.id}`);
}
function readinessMetadata(readiness) {
  const token=object(readiness?.token); const page=object(readiness?.page);
  return {
    messaging_readiness_checked_at:text(readiness?.checked_at)||new Date().toISOString(),
    messaging_readiness:readiness,
    messaging_granted_scopes:Array.isArray(token.granted_scopes)?token.granted_scopes:[],
    messaging_required_scopes_missing:Array.isArray(token.missing_instagram_scopes)?token.missing_instagram_scopes:[],
    messaging_page_instagram_link_ok:page.page_matches===true && page.instagram_business_id_matches===true,
    instagram_messaging_ready:readiness?.ready_for_instagram_messaging===true,
  };
}
export async function fetchMetaMessagingPages({accessToken}) {
  const url=new URL(`https://graph.facebook.com/${graphVersion()}/me/accounts`);
  url.searchParams.set("fields","id,name,access_token,tasks,instagram_business_account{id,username}");
  url.searchParams.set("limit","100");
  url.searchParams.set("access_token",accessToken);
  const payload=await graphJson(url);
  return (Array.isArray(payload?.data)?payload.data:[]).filter((page)=>Array.isArray(page?.tasks)?page.tasks.includes("MESSAGING"):true);
}
export async function existingMetaPreferredPageId({organizationId,pages}) {
  const connection=await ChannelConnectionRuntime.get({organization_id:organizationId,provider:"meta"}).catch(()=>null);
  const assets=connection?.id?await ChannelAssetRuntime.list({organization_id:organizationId,connection_id:connection.id}):[];
  const fb=assets.filter((a)=>a.asset_type==="facebook_page");
  const igPageIds=new Set(assets.filter((a)=>a.asset_type==="instagram_business").map((a)=>text(a?.metadata?.facebook_page_id)).filter(Boolean));
  const assigned=fb.find((a)=>text(a?.metadata?.identity_connection_model)==="MANAGED_ASSET_ASSIGNMENT"||text(a?.metadata?.managed_ad_account_id)) || fb.find((a)=>igPageIds.has(text(a.external_id))) || (fb.length===1?fb[0]:null);
  const preferred=text(assigned?.external_id) || (fb.length===0?text(connection?.metadata?.page_id):"");
  return preferred && pages.some((p)=>text(p.id)===preferred) ? preferred : null;
}
export async function finalizeMetaOrganizationConnection({organizationId,userAccessToken,pageId,origin}) {
  const pages=await fetchMetaMessagingPages({accessToken:userAccessToken});
  const page=pages.find((candidate)=>text(candidate.id)===text(pageId));
  if(!page) throw new Error("Selected Facebook Page is no longer available in this Meta authorization");
  const existingConnection=await ChannelConnectionRuntime.get({organization_id:organizationId,provider:"meta"}).catch(()=>null);
  const existingAssets=existingConnection?.id?await ChannelAssetRuntime.list({organization_id:organizationId,connection_id:existingConnection.id}):[];
  await subscribePageMessaging(page);
  const webhookConfiguration=await configureMessagingWebhooks(origin);
  const instagramId=page.instagram_business_account?.id || null;
  const existingFacebook=existingAssets.find((a)=>a.asset_type==="facebook_page" && text(a.external_id)===text(page.id)) || null;
  const existingInstagram=existingAssets.find((a)=>a.asset_type==="instagram_business" && (text(a.external_id)===text(instagramId)||text(a?.metadata?.facebook_page_id)===text(page.id))) || null;
  const readiness=await inspectMetaMessagingAccess({access_token:page.access_token,page_id:page.id,instagram_business_id:instagramId});
  const credential=await CredentialRuntime.storeSecret({
    provider_id:"meta", credential_type:"oauth_page_token", secret:page.access_token, organization_id:organizationId,
    vault_name:`meta-page-${organizationId}-${page.id}`, vault_description:"Avantiqo Meta Page messaging credential",
    metadata:{organization_id:organizationId,page_id:page.id,page_name:page.name,instagram_business_id:instagramId,instagram_username:page.instagram_business_account?.username||null,purpose:"ORGANIZATION_CHANNEL_PUBLISHING",messaging_permissions_requested:["pages_manage_metadata","pages_messaging","instagram_manage_messages"],messaging_webhook_subscribed:true,messaging_app_webhooks_configured:true,messaging_app_webhook_configuration:webhookConfiguration,instagram_auth_mode:"FACEBOOK_LOGIN"}
  });
  const connection=await ChannelConnectionRuntime.connect({
    organization_id:organizationId,provider:"meta",channel_type:"social",credentials_reference:credential.id,
    metadata:{...object(existingConnection?.metadata),page_id:page.id,page_name:page.name,instagram_business_id:instagramId,instagram_username:page.instagram_business_account?.username||null,messaging_webhook_subscribed:true,messaging_app_webhooks_configured:true,messaging_app_webhook_configuration:webhookConfiguration,messaging_webhook_fields:["messages","messaging_postbacks","message_deliveries","message_reads"],available_pages:pages.map((candidate)=>({id:candidate.id,name:candidate.name,instagram_business_id:candidate.instagram_business_account?.id||null,instagram_username:candidate.instagram_business_account?.username||null,messaging_task:Array.isArray(candidate?.tasks)?candidate.tasks.includes("MESSAGING"):null})),advertising_billing_model:object(existingConnection?.metadata).advertising_billing_model||"AVANTIQO_MANAGED",...readinessMetadata(readiness),communication_history_sync_status:"PENDING",communication_history_sync_attempt_at:null,communication_history_sync_at:null,communication_history_sync_error:null,communication_history_sync_summary:null}
  });
  await ChannelAssetRuntime.register({organization_id:organizationId,connection_id:connection.id,provider:"meta",asset_type:"facebook_page",external_id:page.id,name:page.name,entity_id:existingFacebook?.entity_id||null,selected_by_party_id:existingFacebook?.selected_by_party_id||null,selected_at:existingFacebook?.selected_at||new Date().toISOString(),metadata:{...object(existingFacebook?.metadata),primary_business_asset:true,instagram_business_id:instagramId,instagram_username:page.instagram_business_account?.username||null,messaging_webhook_subscribed:true,messaging_app_webhooks_configured:true}});
  if(instagramId) await ChannelAssetRuntime.register({organization_id:organizationId,connection_id:connection.id,provider:"meta",asset_type:"instagram_business",external_id:instagramId,name:page.instagram_business_account?.username||`${page.name} Instagram`,entity_id:existingInstagram?.entity_id||null,selected_by_party_id:existingInstagram?.selected_by_party_id||null,selected_at:existingInstagram?.selected_at||new Date().toISOString(),metadata:{...object(existingInstagram?.metadata),primary_business_asset:true,facebook_page_id:page.id,messaging_webhook_subscribed:true,messaging_app_webhooks_configured:true}});
  return {connection,page:{id:page.id,name:page.name,instagram_business_id:instagramId,instagram_username:page.instagram_business_account?.username||null},pageCount:pages.length};
}
