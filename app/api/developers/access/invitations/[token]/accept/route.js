import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { getServerCurrentUser } from "@/lib/auth/getServerCurrentUser";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
export const dynamic="force-dynamic";
const hash=(v)=>createHash("sha256").update(String(v)).digest("hex");
export async function POST(_request,{params}){
  try{
    const user=await getServerCurrentUser();
    if(!user?.id||!user?.email) return NextResponse.json({success:false,error:"Authentication required"},{status:401});
    const {token}=await params;
    const {data:invite,error}=await supabaseAdmin.from("developer_portal_invitations").select("*").eq("token_hash",hash(token)).maybeSingle();
    if(error) throw error;
    if(!invite) return NextResponse.json({success:false,error:"Invitation not found"},{status:404});
    if(invite.status!=="PENDING") return NextResponse.json({success:false,error:`Invitation is ${String(invite.status).toLowerCase()}`},{status:409});
    if(new Date(invite.expires_at).getTime()<=Date.now()){await supabaseAdmin.from("developer_portal_invitations").update({status:"EXPIRED"}).eq("id",invite.id);return NextResponse.json({success:false,error:"Invitation has expired"},{status:410});}
    if(String(user.email).trim().toLowerCase()!==String(invite.email).trim().toLowerCase()) return NextResponse.json({success:false,error:"Sign in with the email address that received this developer invitation"},{status:403});
    const {data:access,error:accessError}=await supabaseAdmin.from("developer_portal_access").upsert({organization_id:invite.organization_id,auth_user_id:user.id,email:String(user.email).toLowerCase(),name:invite.name||user.user_metadata?.full_name||null,role:invite.role||"DEVELOPER",permissions:Array.isArray(invite.permissions)?invite.permissions:["operations.view"],status:"ACTIVE",invitation_id:invite.id,updated_at:new Date().toISOString()},{onConflict:"organization_id,auth_user_id"}).select("id,organization_id").single();
    if(accessError) throw accessError;
    const {error:updateError}=await supabaseAdmin.from("developer_portal_invitations").update({status:"ACCEPTED",accepted_by_auth_user_id:user.id,accepted_at:new Date().toISOString()}).eq("id",invite.id).eq("status","PENDING");
    if(updateError) throw updateError;
    return NextResponse.json({success:true,accessId:access.id,redirect:`/workspace/${access.organization_id}/developers`});
  }catch(error){return NextResponse.json({success:false,error:error?.message||"Unable to accept developer invitation"},{status:500});}
}
