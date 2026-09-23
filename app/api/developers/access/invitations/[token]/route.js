import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
export const dynamic="force-dynamic";
const hash=(v)=>createHash("sha256").update(String(v)).digest("hex");
export async function GET(_request,{params}){
  try{
    const {token}=await params;
    const {data:invite,error}=await supabaseAdmin.from("developer_portal_invitations").select("id,organization_id,email,name,role,permissions,status,expires_at").eq("token_hash",hash(token)).maybeSingle();
    if(error) throw error;
    if(!invite) return NextResponse.json({success:false,error:"Invitation not found"},{status:404});
    const {data:organization,error:organizationError}=await supabaseAdmin.from("organizations").select("id,name,legal_name").eq("id",invite.organization_id).maybeSingle();
    if(organizationError) throw organizationError;
    const expired=new Date(invite.expires_at).getTime()<=Date.now();
    if(expired&&invite.status==="PENDING") await supabaseAdmin.from("developer_portal_invitations").update({status:"EXPIRED"}).eq("id",invite.id);
    return NextResponse.json({success:true,invitation:{email:invite.email,name:invite.name,role:invite.role,permissions:invite.permissions,status:expired?"EXPIRED":invite.status,expiresAt:invite.expires_at,organizationName:organization?.name||organization?.legal_name||"Organization"}});
  }catch(error){return NextResponse.json({success:false,error:error?.message||"Unable to load developer invitation"},{status:500});}
}
