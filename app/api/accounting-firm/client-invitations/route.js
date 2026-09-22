import { createHash, randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { deliverInvitationEmail } from "@/lib/access/InvitationEmailDeliveryRuntime";

export const dynamic = "force-dynamic";
const MANAGE_ROLES = new Set(["OWNER","ORGANIZATION_OWNER","ORG_OWNER","PLATFORM_OWNER","SUPER_ADMIN","ADMIN","ADMINISTRATOR","ORGANIZATION_ADMIN","ORG_ADMIN","MANAGER"]);
const hash = (value) => createHash("sha256").update(String(value)).digest("hex");

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
    const [{data:relationships,error:relationshipError},{data:invitations,error:inviteError}] = await Promise.all([
      supabaseAdmin.from("organization_clients").select("id,firm_organization_id,client_organization_id,relationship_status,billing_model,created_at").eq("firm_organization_id",organizationId).order("created_at",{ascending:false}),
      supabaseAdmin.from("organization_client_invitations").select("id,firm_organization_id,client_email,billing_model,status,expires_at,created_at,accepted_at,accepted_client_organization_id,revoked_at").eq("firm_organization_id",organizationId).order("created_at",{ascending:false}).limit(500),
    ]);
    if (relationshipError) throw relationshipError;
    if (inviteError) throw inviteError;
    const clientIds=[...new Set((relationships||[]).map(row=>row.client_organization_id).filter(Boolean))];
    const {data:clients,error:clientError}=clientIds.length?await supabaseAdmin.from("organizations").select("id,name,legal_name,industry,country,organization_status,status").in("id",clientIds):{data:[],error:null};
    if(clientError) throw clientError;
    const clientById=new Map((clients||[]).map(org=>[String(org.id),org]));
    return NextResponse.json({success:true,relationships:(relationships||[]).map(row=>({...row,client:clientById.get(String(row.client_organization_id))||null})),invitations:invitations||[]});
  } catch(error) {
    return NextResponse.json({success:false,error:error?.message||"Unable to load accounting firm clients"},{status:500});
  }
}

export async function POST(request) {
  try {
    const body=await request.json().catch(()=>({}));
    const organizationId=String(body?.organizationId||"").trim();
    const clientEmail=String(body?.clientEmail||"").trim().toLowerCase();
    const billingModel=String(body?.billingModel||"firm_pays").trim().toLowerCase();
    if(!organizationId||!clientEmail) return NextResponse.json({success:false,error:"organizationId and clientEmail are required"},{status:400});
    if(!["firm_pays","client_pays"].includes(billingModel)) return NextResponse.json({success:false,error:"billingModel must be firm_pays or client_pays"},{status:400});
    const context=await firmAccess(organizationId,request);
    if(context.response) return context.response;
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
    if(!organizationId||!action) return NextResponse.json({success:false,error:"organizationId and action required"},{status:400});
    const context=await firmAccess(organizationId,request);
    if(context.response) return context.response;
    if(action==="revoke_invitation"){
      if(!invitationId) return NextResponse.json({success:false,error:"invitationId required"},{status:400});
      const {error}=await supabaseAdmin.from("organization_client_invitations").update({status:"REVOKED",revoked_at:new Date().toISOString()}).eq("id",invitationId).eq("firm_organization_id",organizationId).eq("status","PENDING");
      if(error) throw error;
      return NextResponse.json({success:true});
    }
    if(action==="end_relationship"){
      if(!relationshipId) return NextResponse.json({success:false,error:"relationshipId required"},{status:400});
      const {error}=await supabaseAdmin.from("organization_clients").update({relationship_status:"inactive"}).eq("id",relationshipId).eq("firm_organization_id",organizationId);
      if(error) throw error;
      return NextResponse.json({success:true});
    }
    return NextResponse.json({success:false,error:"Unsupported client relationship action"},{status:400});
  } catch(error) {
    return NextResponse.json({success:false,error:error?.message||"Unable to update accounting client relationship"},{status:500});
  }
}
