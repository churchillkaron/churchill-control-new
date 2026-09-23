import { createHash, randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { deliverInvitationEmail } from "@/lib/access/InvitationEmailDeliveryRuntime";

export const dynamic = "force-dynamic";
const ALLOWED = new Set(["OWNER","ORGANIZATION_OWNER","ORG_OWNER","PLATFORM_OWNER","SUPER_ADMIN","MANAGER","PROCUREMENT"]);
const hash = (value) => createHash("sha256").update(String(value)).digest("hex");
const validEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim()) && String(value || "").trim().length <= 320;

async function managementAccess({ organizationId, request }) {
  const access = await requireOrganizationAccess({ organizationId, request });
  if (!access.success) return { response: NextResponse.json({ success:false, error:access.error }, { status:access.status || 403 }) };
  if (!ALLOWED.has(String(access.role || "").toUpperCase())) return { response: NextResponse.json({ success:false, error:"Supplier portal access management permission required" }, { status:403 }) };
  return { access };
}

export async function GET(request) {
  try {
    const organizationId = new URL(request.url).searchParams.get("organizationId") || "";
    if (!organizationId) return NextResponse.json({ success:false, error:"organizationId required" }, { status:400 });
    const context = await managementAccess({ organizationId, request });
    if (context.response) return context.response;

    const [{ data: invitations, error: inviteError }, { data: accessRows, error: accessError }] = await Promise.all([
      supabaseAdmin.from("supplier_portal_invitations").select("id,organization_id,supplier_profile_id,supplier_party_id,email,status,expires_at,created_at,accepted_at,revoked_at").eq("organization_id", organizationId).order("created_at", { ascending:false }).limit(500),
      supabaseAdmin.from("supplier_portal_access").select("id,organization_id,supplier_profile_id,supplier_party_id,email,status,created_at,updated_at").eq("organization_id", organizationId).order("created_at", { ascending:false }).limit(500),
    ]);
    if (inviteError) throw inviteError;
    if (accessError) throw accessError;

    const partyIds = [...new Set([...(invitations || []), ...(accessRows || [])].map((row) => row.supplier_party_id).filter(Boolean))];
    const { data: parties, error: partyError } = partyIds.length
      ? await supabaseAdmin.from("parties").select("id,organization_id,display_name,legal_name,email").in("id", partyIds).eq("organization_id", organizationId)
      : { data: [], error: null };
    if (partyError) throw partyError;
    const partyById = new Map((parties || []).map((party) => [String(party.id), party]));

    const enrich = (row) => ({ ...row, parties: partyById.get(String(row.supplier_party_id)) || null });
    return NextResponse.json({
      success:true,
      invitations:(invitations || []).map(enrich),
      access:(accessRows || []).map(enrich),
    });
  } catch (error) {
    return NextResponse.json({ success:false, error:error?.message || "Unable to load supplier portal access" }, { status:500 });
  }
}

export async function POST(request){
  try{
    const body=await request.json();
    const organizationId=String(body?.organizationId||"").trim();
    const supplierProfileId=String(body?.supplierProfileId||"").trim();
    if(!organizationId||!supplierProfileId) return NextResponse.json({success:false,error:"organizationId and supplierProfileId are required"},{status:400});
    const context=await managementAccess({organizationId,request});
    if(context.response) return context.response;

    const {data:supplier,error:supplierError}=await supabaseAdmin.from("supplier_profiles").select("id,organization_id,party_id,is_active,is_blocked").eq("id",supplierProfileId).eq("organization_id",organizationId).maybeSingle();
    if(supplierError) throw supplierError;
    if(!supplier||supplier.is_active===false||supplier.is_blocked===true) return NextResponse.json({success:false,error:"Active supplier not found"},{status:404});
    const {data:party,error:partyError}=await supabaseAdmin.from("parties").select("id,organization_id,display_name,legal_name,email,status").eq("id",supplier.party_id).eq("organization_id",organizationId).maybeSingle();
    if(partyError) throw partyError;
    if(!party) return NextResponse.json({success:false,error:"Canonical supplier Party not found"},{status:404});
    const email=String(party.email||"").trim().toLowerCase();
    if(!email) return NextResponse.json({success:false,error:"Supplier email is required before portal access can be invited"},{status:400});
    if(!validEmail(email)) return NextResponse.json({success:false,error:"Supplier email is invalid"},{status:400});

    await supabaseAdmin.from("supplier_portal_invitations").update({status:"REVOKED",revoked_at:new Date().toISOString()}).eq("organization_id",organizationId).eq("supplier_profile_id",supplierProfileId).eq("status","PENDING");
    const token=randomBytes(32).toString("base64url");
    const expiresAt=new Date(Date.now()+7*24*60*60*1000).toISOString();
    const {data:invite,error}=await supabaseAdmin.from("supplier_portal_invitations").insert({organization_id:organizationId,supplier_profile_id:supplierProfileId,supplier_party_id:supplier.party_id,email,token_hash:hash(token),status:"PENDING",expires_at:expiresAt,created_by_auth_user_id:context.access.userId}).select("id,email,expires_at").single();
    if(error) throw error;
    const origin=new URL(request.url).origin;
    const inviteUrl=`${origin}/supplier-invite/${token}`;
    const {data:organization}=await supabaseAdmin.from("organizations").select("name,legal_name").eq("id",organizationId).maybeSingle();
    const delivery=await deliverInvitationEmail({
      organizationId,
      kind:"supplier",
      recipient:email,
      recipientName:party.display_name||party.legal_name||null,
      sourceName:organization?.name||organization?.legal_name||"Customer",
      inviteUrl,
      expiresAt:invite.expires_at,
    });
    return NextResponse.json({success:true,invite:{...invite,supplierName:party.display_name||party.legal_name||"Supplier",url:inviteUrl},delivery});
  }catch(error){ return NextResponse.json({success:false,error:error?.message||"Unable to create supplier invitation"},{status:500}); }
}

export async function PATCH(request) {
  try {
    const body = await request.json();
    const organizationId = String(body?.organizationId || "").trim();
    const accessId = String(body?.accessId || "").trim();
    const invitationId = String(body?.invitationId || "").trim();
    const action = String(body?.action || "").trim().toLowerCase();
    if (!organizationId || !action) return NextResponse.json({ success:false, error:"organizationId and action are required" }, { status:400 });
    const context = await managementAccess({ organizationId, request });
    if (context.response) return context.response;

    if (action === "update_supplier_email") {
      const supplierProfileId = String(body?.supplierProfileId || "").trim();
      const email = String(body?.email || "").trim().toLowerCase();
      if (!supplierProfileId || !email) return NextResponse.json({ success:false, error:"supplierProfileId and email are required" }, { status:400 });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ success:false, error:"Enter a valid supplier email" }, { status:400 });
      const { data:supplier, error:supplierError } = await supabaseAdmin
        .from("supplier_profiles")
        .select("id,organization_id,party_id,is_active,is_blocked")
        .eq("id", supplierProfileId)
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (supplierError) throw supplierError;
      if (!supplier || supplier.is_active === false || supplier.is_blocked === true) return NextResponse.json({ success:false, error:"Active supplier not found" }, { status:404 });
      const { data:party, error:partyError } = await supabaseAdmin
        .from("parties")
        .update({ email })
        .eq("id", supplier.party_id)
        .eq("organization_id", organizationId)
        .select("id,email")
        .maybeSingle();
      if (partyError) throw partyError;
      if (!party) return NextResponse.json({ success:false, error:"Canonical supplier Party not found" }, { status:404 });
      return NextResponse.json({ success:true, supplier:{ supplierProfileId, partyId:party.id, email:party.email } });
    }

    if (action === "revoke_access") {
      if (!accessId) return NextResponse.json({ success:false, error:"accessId required" }, { status:400 });
      const { error } = await supabaseAdmin.from("supplier_portal_access").update({ status:"REVOKED", updated_at:new Date().toISOString() }).eq("id", accessId).eq("organization_id", organizationId);
      if (error) throw error;
      return NextResponse.json({ success:true });
    }
    if (action === "revoke_invitation") {
      if (!invitationId) return NextResponse.json({ success:false, error:"invitationId required" }, { status:400 });
      const { error } = await supabaseAdmin.from("supplier_portal_invitations").update({ status:"REVOKED", revoked_at:new Date().toISOString() }).eq("id", invitationId).eq("organization_id", organizationId).eq("status", "PENDING");
      if (error) throw error;
      return NextResponse.json({ success:true });
    }
    return NextResponse.json({ success:false, error:"Unsupported supplier access action" }, { status:400 });
  } catch (error) {
    return NextResponse.json({ success:false, error:error?.message || "Unable to update supplier portal access" }, { status:500 });
  }
}
