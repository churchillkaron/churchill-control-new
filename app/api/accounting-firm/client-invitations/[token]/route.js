import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { getServerCurrentUser } from "@/lib/auth/getServerCurrentUser";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
export const dynamic="force-dynamic";
const hash=(v)=>createHash("sha256").update(String(v)).digest("hex");
const ACCEPT_ROLES=new Set(["OWNER","ORGANIZATION_OWNER","ORG_OWNER","PLATFORM_OWNER","SUPER_ADMIN","ADMIN","ADMINISTRATOR","ORGANIZATION_ADMIN","ORG_ADMIN"]);

async function eligibleOrganizations(userId){
  const {data:staff,error:staffError}=await supabaseAdmin.from("staff_accounts").select("id,auth_user_id,active,active_organization_id").eq("auth_user_id",userId).eq("active",true).limit(500);
  if(staffError) throw staffError;
  const staffIds=(staff||[]).map(row=>row.id).filter(Boolean);
  if(!staffIds.length) return [];
  const {data:memberships,error:membershipError}=await supabaseAdmin.from("organization_users").select("id,organization_id,staff_account_id,role,status").in("staff_account_id",staffIds).eq("status","active").limit(1000);
  if(membershipError) throw membershipError;
  const allowed=(memberships||[]).filter(row=>ACCEPT_ROLES.has(String(row.role||"").trim().toUpperCase()));
  const ids=[...new Set(allowed.map(row=>row.organization_id).filter(Boolean))];
  if(!ids.length) return [];
  const {data:organizations,error:orgError}=await supabaseAdmin.from("organizations").select("id,name,legal_name,organization_type,organization_status,status").in("id",ids);
  if(orgError) throw orgError;
  return (organizations||[]).filter(org=>org.organization_status==="ACTIVE"&&org.status!=="setup_failed"&&org.organization_type!=="accounting_firm");
}

export async function GET(_request,{params}){
  try{
    const {token}=await params;
    const {data:invite,error}=await supabaseAdmin.from("organization_client_invitations").select("id,firm_organization_id,client_email,billing_model,status,expires_at").eq("token_hash",hash(token)).maybeSingle();
    if(error) throw error;
    if(!invite) return NextResponse.json({success:false,error:"Invitation not found"},{status:404});
    const {data:firm,error:firmError}=await supabaseAdmin.from("organizations").select("id,name,legal_name,organization_type").eq("id",invite.firm_organization_id).maybeSingle();
    if(firmError) throw firmError;
    const expired=new Date(invite.expires_at).getTime()<=Date.now();
    if(expired&&invite.status==="PENDING") await supabaseAdmin.from("organization_client_invitations").update({status:"EXPIRED"}).eq("id",invite.id);
    const user=await getServerCurrentUser();
    const emailMatches=Boolean(user?.email&&String(user.email).trim().toLowerCase()===String(invite.client_email).trim().toLowerCase());
    const eligible=user?.id&&emailMatches?await eligibleOrganizations(user.id):[];
    return NextResponse.json({success:true,invitation:{email:invite.client_email,billingModel:invite.billing_model,status:expired?"EXPIRED":invite.status,expiresAt:invite.expires_at,firmName:firm?.name||firm?.legal_name||"Accounting firm"},authenticated:Boolean(user?.id),emailMatches,eligibleOrganizations:eligible});
  }catch(error){return NextResponse.json({success:false,error:error?.message||"Unable to load client invitation"},{status:500});}
}
