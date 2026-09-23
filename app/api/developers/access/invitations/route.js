import { createHash, randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { canManageDeveloperSecurity, requireDeveloperPortalAccess } from "@/lib/developer/DeveloperPortalRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { deliverInvitationEmail } from "@/lib/access/InvitationEmailDeliveryRuntime";

export const dynamic = "force-dynamic";
const ROLES = new Set(["DEVELOPER","INTEGRATOR","PARTNER"]);
const PORTAL_PERMISSIONS = new Set(["developer.webhooks.manage","developer.security.manage"]);
const hash = (value) => createHash("sha256").update(String(value)).digest("hex");
const validEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim()) && String(value || "").trim().length <= 320;

function normalizePermissions(value) {
  const requested = Array.isArray(value) ? value : [];
  const permissions = [...new Set(requested.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean))].slice(0, 64);
  return permissions.length ? permissions : ["operations.view"];
}

async function managementAccess(organizationId, request) {
  const access = await requireDeveloperPortalAccess({ organizationId, request });
  if (!access.success) return { response:NextResponse.json({success:false,error:access.error||"Developer access required"},{status:access.status||403}) };
  if (!canManageDeveloperSecurity(access)) return { response:NextResponse.json({success:false,error:"Developer security authority required"},{status:403}) };
  return { access };
}

export async function GET(request) {
  try {
    const organizationId = new URL(request.url).searchParams.get("organizationId") || "";
    if (!organizationId) return NextResponse.json({success:false,error:"organizationId required"},{status:400});
    const context = await managementAccess(organizationId, request);
    if (context.response) return context.response;
    const [{data:invitations,error:inviteError},{data:access,error:accessError}] = await Promise.all([
      supabaseAdmin.from("developer_portal_invitations").select("id,organization_id,email,name,role,permissions,status,expires_at,created_at,accepted_at,revoked_at").eq("organization_id",organizationId).order("created_at",{ascending:false}).limit(500),
      supabaseAdmin.from("developer_portal_access").select("id,organization_id,auth_user_id,email,name,role,permissions,status,created_at,updated_at").eq("organization_id",organizationId).order("created_at",{ascending:false}).limit(500),
    ]);
    if (inviteError) throw inviteError;
    if (accessError) throw accessError;
    return NextResponse.json({success:true,invitations:invitations||[],access:access||[]});
  } catch (error) {
    return NextResponse.json({success:false,error:error?.message||"Unable to load developer access"},{status:500});
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = String(body?.organizationId || "").trim();
    const email = String(body?.email || "").trim().toLowerCase();
    const name = String(body?.name || "").trim() || null;
    const role = String(body?.role || "DEVELOPER").trim().toUpperCase();
    const permissions = normalizePermissions(body?.permissions);
    if (!organizationId || !email) return NextResponse.json({success:false,error:"organizationId and email are required"},{status:400});
    if (!validEmail(email)) return NextResponse.json({success:false,error:"Developer email is invalid"},{status:400});
    if (!ROLES.has(role)) return NextResponse.json({success:false,error:"role must be DEVELOPER, INTEGRATOR or PARTNER"},{status:400});
    if (!permissions.every((permission) => PORTAL_PERMISSIONS.has(permission) || /^operations(?:\.[a-z0-9-]+)*(?:\.\*)?$/.test(permission))) {
      return NextResponse.json({success:false,error:"Unsupported Developer Portal permission"},{status:400});
    }
    const context = await managementAccess(organizationId, request);
    if (context.response) return context.response;

    await supabaseAdmin.from("developer_portal_invitations").update({status:"REVOKED",revoked_at:new Date().toISOString()}).eq("organization_id",organizationId).ilike("email",email).eq("status","PENDING");
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now()+7*24*60*60*1000).toISOString();
    const {data:invite,error} = await supabaseAdmin.from("developer_portal_invitations").insert({organization_id:organizationId,email,name,role,permissions,token_hash:hash(token),status:"PENDING",expires_at:expiresAt,created_by_auth_user_id:context.access.user?.id||context.access.userId||null}).select("id,email,name,role,permissions,expires_at").single();
    if (error) throw error;
    const origin = new URL(request.url).origin;
    const inviteUrl=`${origin}/developer-invite/${token}`;
    const {data:organization}=await supabaseAdmin.from("organizations").select("name,legal_name").eq("id",organizationId).maybeSingle();
    const delivery=await deliverInvitationEmail({
      organizationId,
      kind:"developer",
      recipient:email,
      recipientName:name,
      sourceName:organization?.name||organization?.legal_name||"Organization",
      inviteUrl,
      expiresAt:invite.expires_at,
      role,
      permissions,
    });
    return NextResponse.json({success:true,invite:{...invite,url:inviteUrl},delivery});
  } catch (error) {
    return NextResponse.json({success:false,error:error?.message||"Unable to create developer invitation"},{status:500});
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = String(body?.organizationId || "").trim();
    const action = String(body?.action || "").trim().toLowerCase();
    const accessId = String(body?.accessId || "").trim();
    const invitationId = String(body?.invitationId || "").trim();
    if (!organizationId || !action) return NextResponse.json({success:false,error:"organizationId and action are required"},{status:400});
    const context = await managementAccess(organizationId, request);
    if (context.response) return context.response;
    if (action === "revoke_access") {
      if (!accessId) return NextResponse.json({success:false,error:"accessId required"},{status:400});
      const {error}=await supabaseAdmin.from("developer_portal_access").update({status:"REVOKED",updated_at:new Date().toISOString()}).eq("id",accessId).eq("organization_id",organizationId);
      if(error) throw error;
      return NextResponse.json({success:true});
    }
    if (action === "revoke_invitation") {
      if (!invitationId) return NextResponse.json({success:false,error:"invitationId required"},{status:400});
      const {error}=await supabaseAdmin.from("developer_portal_invitations").update({status:"REVOKED",revoked_at:new Date().toISOString()}).eq("id",invitationId).eq("organization_id",organizationId).eq("status","PENDING");
      if(error) throw error;
      return NextResponse.json({success:true});
    }
    return NextResponse.json({success:false,error:"Unsupported developer access action"},{status:400});
  } catch (error) {
    return NextResponse.json({success:false,error:error?.message||"Unable to update developer access"},{status:500});
  }
}
