import { createHash, randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { deliverInvitationEmail } from "@/lib/access/InvitationEmailDeliveryRuntime";
import { createManagedAccountingClient, listManagedAccountingClients } from "@/lib/accounting/managed-clients/AccountingManagedClientRuntime";

export const dynamic = "force-dynamic";
const MANAGE_ROLES = new Set(["OWNER","ORGANIZATION_OWNER","ORG_OWNER","PLATFORM_OWNER","SUPER_ADMIN","ADMIN","ADMINISTRATOR","ORGANIZATION_ADMIN","ORG_ADMIN","MANAGER"]);
const hash = (value) => createHash("sha256").update(String(value)).digest("hex");
const validEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim()) && String(value || "").trim().length <= 320;

async function firmAccess(organizationId, request) {
  const access = await requireOrganizationAccess({ organizationId, request });
  if (!access.success) return { response:NextResponse.json({success:false,error:access.error},{status:access.status||403}) };
  const role = String(access.role || "").trim().toUpperCase();
  if (!MANAGE_ROLES.has(role)) return { response:NextResponse.json({success:false,error:"Accounting firm client-management permission required"},{status:403}) };
  const { data: organization, error } = await supabaseAdmin.from("organizations").select("id,name,legal_name,organization_type,organization_status,status").eq("id", organizationId).maybeSingle();
  if (error) throw error;
  if (!organization || organization.organization_type !== "accounting_firm") return { response:NextResponse.json({success:false,error:"Accounting firm organization required"},{status:409}) };
  return { access, organization };
}

export async function GET(request) {
  try {
    const organizationId = new URL(request.url).searchParams.get("organizationId") || "";
    if (!organizationId) return NextResponse.json({success:false,error:"organizationId required"},{status:400});
    const context = await firmAccess(organizationId, request);
    if (context.response) return context.response;
    const [{data:relationships,error:relationshipError},{data:invitations,error:inviteError},managedClients] = await Promise.all([
      supabaseAdmin.from("organization_clients").select("id,firm_organization_id,client_organization_id,relationship_status,billing_model,created_at").eq("firm_organization_id",organizationId).order("created_at",{ascending:false}),
      supabaseAdmin.from("organization_client_invitations").select("id,firm_organization_id,client_email,billing_model,status,expires_at,created_at,accepted_at,accepted_client_organization_id,revoked_at").eq("firm_organization_id",organizationId).order("created_at",{ascending:false}).limit(500),
      listManagedAccountingClients(organizationId),
    ]);
    if (relationshipError) throw relationshipError;
    if (inviteError) throw inviteError;
    const clientIds=[...new Set((relationships||[]).map(row=>row.client_organization_id).filter(Boolean))];
    const {data:clients,error:clientError}=clientIds.length?await supabaseAdmin.from("organizations").select("id,name,legal_name,industry,country,organization_status,status").in("id",clientIds):{data:[],error:null};
    if(clientError) throw clientError;
    const clientById=new Map((clients||[]).map(org=>[String(org.id),org]));
    return NextResponse.json({success:true,relationships:(relationships||[]).map(row=>({...row,client:clientById.get(String(row.client_organization_id))||null})),invitations:invitations||[],managedClients:managedClients||[]});
  } catch(error) {
    return NextResponse.json({success:false,error:error?.message||"Unable to load accounting firm clients"},{status:500});
  }
}

export async function POST(request) {
  try {
    const body=await request.json().catch(()=>({}));
    const organizationId=String(body?.organizationId||"").trim();
    const action=String(body?.action||"invite_client").trim().toLowerCase();
    if(!organizationId) return NextResponse.json({success:false,error:"organizationId is required"},{status:400});
    const context=await firmAccess(organizationId,request);
    if(context.response) return context.response;

    if(action==="create_managed_client"){
      const result=await createManagedAccountingClient({
        firmOrganizationId:organizationId,
        createdByAuthUserId:context.access.user?.id||context.access.userId||null,
        legalName:body?.legalName,
        registrationNumber:body?.registrationNumber,
        taxNumber:body?.taxNumber,
        contactEmail:body?.contactEmail,
        country:body?.country,
        currency:body?.currency,
        accountingStandard:body?.accountingStandard,
        fiscalYearStartMonth:body?.fiscalYearStartMonth,
        billingModel:String(body?.billingModel||"firm_pays").trim().toLowerCase(),
      });
      return NextResponse.json({success:true,...result});
    }

    const clientEmail=String(body?.clientEmail||"").trim().toLowerCase();
    const billingModel=String(body?.billingModel||"firm_pays").trim().toLowerCase();
    if(!clientEmail) return NextResponse.json({success:false,error:"clientEmail is required"},{status:400});
    if(!validEmail(clientEmail)) return NextResponse.json({success:false,error:"clientEmail is invalid"},{status:400});
    if(!["firm_pays","client_pays"].includes(billingModel)) return NextResponse.json({success:false,error:"billingModel must be firm_pays or client_pays"},{status:400});
    await supabaseAdmin.from("organization_client_invitations").update({status:"REVOKED",revoked_at:new Date().toISOString()}).eq("firm_organization_id",organizationId).ilike("client_email",clientEmail).eq("status","PENDING");
    const token=randomBytes(32).toString("base64url");
    const expiresAt=new Date(Date.now()+14*24*60*60*1000).toISOString();
    const {data:invite,error}=await supabaseAdmin.from("organization_client_invitations").insert({firm_organization_id:organizationId,client_email:clientEmail,billing_model:billingModel,token_hash:hash(token),status:"PENDING",expires_at:expiresAt,created_by_auth_user_id:context.access.user?.id||context.access.userId||null}).select("id,client_email,billing_model,expires_at").single();
    if(error) throw error;
    const origin=new URL(request.url).origin;
    const inviteUrl=`${origin}/accounting-client-invite/${token}`;
    const delivery=await deliverInvitationEmail({
      organizationId,
      kind:"accounting_client",
      recipient:clientEmail,
      sourceName:context.organization?.name||context.organization?.legal_name||"Accounting firm",
      inviteUrl,
      expiresAt:invite.expires_at,
      billingModel,
    });
    return NextResponse.json({success:true,invite:{...invite,url:inviteUrl},delivery});
  } catch(error) {
    return NextResponse.json({success:false,error:error?.message||"Unable to invite accounting client"},{status:500});
  }
}

export async function PATCH(request) {
  try {
    const body=await request.json().catch(()=>({}));
    const organizationId=String(body?.organizationId||"").trim();
    const action=String(body?.action||"").trim().toLowerCase();
    const invitationId=String(body?.invitationId||"").trim();
    const relationshipId=String(body?.relationshipId||"").trim();
    const managedClientId=String(body?.managedClientId||"").trim();
    const claimEmail=String(body?.claimEmail||"").trim().toLowerCase();
    if(!organizationId||!action) return NextResponse.json({success:false,error:"organizationId and action required"},{status:400});
    const context=await firmAccess(organizationId,request);
    if(context.response) return context.response;
    if(action==="invite_managed_client_claim"){
      if(!managedClientId) return NextResponse.json({success:false,error:"managedClientId required"},{status:400});
      const {data:managedClient,error:managedError}=await supabaseAdmin
        .from("accounting_managed_clients")
        .select("id,client_organization_id,organization_client_relationship_id,management_status,contact_email")
        .eq("id",managedClientId)
        .eq("firm_organization_id",organizationId)
        .maybeSingle();
      if(managedError) throw managedError;
      if(!managedClient) return NextResponse.json({success:false,error:"Managed client not found"},{status:404});
      const relationship=await supabaseAdmin.from("organization_clients").select("id,relationship_status").eq("id",managedClient.organization_client_relationship_id).eq("firm_organization_id",organizationId).maybeSingle();
      if(relationship.error) throw relationship.error;
      if(!relationship.data||relationship.data.relationship_status!=="active") return NextResponse.json({success:false,error:"Accounting relationship is no longer active"},{status:409});
      if(managedClient.management_status==="CLAIMED") return NextResponse.json({success:false,error:"Managed client is already claimed"},{status:409});
      const recipient=claimEmail||String(managedClient.contact_email||"").trim().toLowerCase();
      if(!recipient) return NextResponse.json({success:false,error:"A client email is required before inviting claim"},{status:400});
      if(!validEmail(recipient)) return NextResponse.json({success:false,error:"Client claim email is invalid"},{status:400});
      const token=randomBytes(32).toString("base64url");
      const expiresAt=new Date(Date.now()+14*24*60*60*1000).toISOString();
      const invitedAt=new Date().toISOString();
      const {data:claimed,error:claimError}=await supabaseAdmin
        .from("accounting_managed_clients")
        .update({management_status:"CLAIM_PENDING",claim_email:recipient,claim_token_hash:hash(token),claim_expires_at:expiresAt,claim_invited_at:invitedAt,updated_at:invitedAt})
        .eq("id",managedClientId)
        .eq("firm_organization_id",organizationId)
        .in("management_status",["UNCLAIMED","CLAIM_PENDING"])
        .select("id,client_organization_id,management_status,claim_email,claim_expires_at")
        .maybeSingle();
      if(claimError) throw claimError;
      if(!claimed) return NextResponse.json({success:false,error:"Managed client claim state changed; reload and try again"},{status:409});
      const origin=new URL(request.url).origin;
      const claimUrl=`${origin}/accounting-managed-client-claim/${token}`;
      const delivery=await deliverInvitationEmail({
        organizationId,
        kind:"accounting_managed_client_claim",
        recipient,
        sourceName:context.organization?.name||context.organization?.legal_name||"Accounting firm",
        inviteUrl:claimUrl,
        expiresAt,
      });
      return NextResponse.json({success:true,claim:{...claimed,url:claimUrl},delivery});
    }
    if(action==="revoke_invitation"){
      if(!invitationId) return NextResponse.json({success:false,error:"invitationId required"},{status:400});
      const {error}=await supabaseAdmin.from("organization_client_invitations").update({status:"REVOKED",revoked_at:new Date().toISOString()}).eq("id",invitationId).eq("firm_organization_id",organizationId).eq("status","PENDING");
      if(error) throw error;
      return NextResponse.json({success:true});
    }
    if(action==="end_relationship"){
      if(!relationshipId) return NextResponse.json({success:false,error:"relationshipId required"},{status:400});
      const {data:ended,error}=await supabaseAdmin.from("organization_clients").update({relationship_status:"inactive"}).eq("id",relationshipId).eq("firm_organization_id",organizationId).select("id").maybeSingle();
      if(error) throw error;
      if(!ended) return NextResponse.json({success:false,error:"Client relationship not found"},{status:404});
      const archivedAt=new Date().toISOString();
      const managed=await supabaseAdmin.from("accounting_managed_clients").update({
        management_status:"ARCHIVED",
        claim_token_hash:null,
        claim_expires_at:null,
        claim_email:null,
        claiming_by_auth_user_id:null,
        claiming_attempt_id:null,
        claiming_started_at:null,
        updated_at:archivedAt,
      }).eq("organization_client_relationship_id",relationshipId).eq("firm_organization_id",organizationId).in("management_status",["UNCLAIMED","CLAIM_PENDING","CLAIMING"]);
      if(managed.error && managed.error.code!=="42P01") throw managed.error;
      return NextResponse.json({success:true});
    }
    return NextResponse.json({success:false,error:"Unsupported client relationship action"},{status:400});
  } catch(error) {
    return NextResponse.json({success:false,error:error?.message||"Unable to update accounting client relationship"},{status:500});
  }
}
