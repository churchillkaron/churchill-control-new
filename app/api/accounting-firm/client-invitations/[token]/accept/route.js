import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { getServerCurrentUser } from "@/lib/auth/getServerCurrentUser";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
export const dynamic="force-dynamic";
const hash=(v)=>createHash("sha256").update(String(v)).digest("hex");
const ACCEPT_ROLES=new Set(["OWNER","ORGANIZATION_OWNER","ORG_OWNER","PLATFORM_OWNER","SUPER_ADMIN","ADMIN","ADMINISTRATOR","ORGANIZATION_ADMIN","ORG_ADMIN"]);

export async function POST(request,{params}){
  try{
    const user=await getServerCurrentUser();
    if(!user?.id||!user?.email) return NextResponse.json({success:false,error:"Authentication required"},{status:401});
    const body=await request.json().catch(()=>({}));
    const clientOrganizationId=String(body?.clientOrganizationId||"").trim();
    if(!clientOrganizationId) return NextResponse.json({success:false,error:"clientOrganizationId required"},{status:400});
    const {token}=await params;
    const {data:invite,error}=await supabaseAdmin.from("organization_client_invitations").select("*").eq("token_hash",hash(token)).maybeSingle();
    if(error) throw error;
    if(!invite) return NextResponse.json({success:false,error:"Invitation not found"},{status:404});
    if(invite.status!=="PENDING") return NextResponse.json({success:false,error:`Invitation is ${String(invite.status).toLowerCase()}`},{status:409});
    if(new Date(invite.expires_at).getTime()<=Date.now()){await supabaseAdmin.from("organization_client_invitations").update({status:"EXPIRED"}).eq("id",invite.id);return NextResponse.json({success:false,error:"Invitation has expired"},{status:410});}
    if(String(user.email).trim().toLowerCase()!==String(invite.client_email).trim().toLowerCase()) return NextResponse.json({success:false,error:"Sign in with the email address that received this client invitation"},{status:403});
    if(clientOrganizationId===invite.firm_organization_id) return NextResponse.json({success:false,error:"The accounting firm cannot link itself as a client"},{status:400});
    const access=await requireOrganizationAccess({organizationId:clientOrganizationId,request});
    if(!access.success) return NextResponse.json({success:false,error:access.error||"Client organization access required"},{status:access.status||403});
    if(!ACCEPT_ROLES.has(String(access.role||"").trim().toUpperCase())) return NextResponse.json({success:false,error:"Client owner or administrator authority required"},{status:403});
    const {data:client,error:clientError}=await supabaseAdmin.from("organizations").select("id,organization_type,organization_status,status").eq("id",clientOrganizationId).maybeSingle();
    if(clientError) throw clientError;
    if(!client||client.organization_status!=="ACTIVE"||client.status==="setup_failed") return NextResponse.json({success:false,error:"Active client organization required"},{status:409});
    if(client.organization_type==="accounting_firm") return NextResponse.json({success:false,error:"Accounting firm organizations cannot be linked as accounting clients through this flow"},{status:409});
    const {data:relationship,error:relationshipError}=await supabaseAdmin.from("organization_clients").upsert({firm_organization_id:invite.firm_organization_id,client_organization_id:clientOrganizationId,relationship_status:"active",billing_model:invite.billing_model||"firm_pays"},{onConflict:"firm_organization_id,client_organization_id"}).select("id,firm_organization_id,client_organization_id,relationship_status,billing_model").single();
    if(relationshipError) throw relationshipError;
    const {error:updateError}=await supabaseAdmin.from("organization_client_invitations").update({status:"ACCEPTED",accepted_by_auth_user_id:user.id,accepted_client_organization_id:clientOrganizationId,accepted_at:new Date().toISOString()}).eq("id",invite.id).eq("status","PENDING");
    if(updateError) throw updateError;
    return NextResponse.json({success:true,relationship});
  }catch(error){return NextResponse.json({success:false,error:error?.message||"Unable to accept accounting client invitation"},{status:500});}
}
