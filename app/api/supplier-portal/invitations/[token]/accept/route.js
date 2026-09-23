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
    const {data:invite,error}=await supabaseAdmin
      .from("supplier_portal_invitations")
      .select("*")
      .eq("token_hash",hash(token))
      .maybeSingle();
    if(error) throw error;
    if(!invite) return NextResponse.json({success:false,error:"Invitation not found"},{status:404});
    if(invite.status!=="PENDING") return NextResponse.json({success:false,error:`Invitation is ${String(invite.status).toLowerCase()}`},{status:409});

    if(new Date(invite.expires_at).getTime()<=Date.now()){
      await supabaseAdmin
        .from("supplier_portal_invitations")
        .update({status:"EXPIRED"})
        .eq("id",invite.id)
        .eq("status","PENDING");
      return NextResponse.json({success:false,error:"Invitation has expired"},{status:410});
    }

    const email=String(user.email).trim().toLowerCase();
    if(email!==String(invite.email).trim().toLowerCase()){
      return NextResponse.json({success:false,error:"Sign in with the email address that received this supplier invitation"},{status:403});
    }

    const acceptedAt=new Date().toISOString();
    const {data:claimedInvite,error:claimError}=await supabaseAdmin
      .from("supplier_portal_invitations")
      .update({
        status:"ACCEPTED",
        accepted_by_auth_user_id:user.id,
        accepted_at:acceptedAt,
      })
      .eq("id",invite.id)
      .eq("status","PENDING")
      .gt("expires_at",acceptedAt)
      .select("*")
      .maybeSingle();
    if(claimError) throw claimError;
    if(!claimedInvite){
      return NextResponse.json({success:false,error:"Invitation was already accepted, revoked or expired"},{status:409});
    }

    const {data:access,error:accessError}=await supabaseAdmin
      .from("supplier_portal_access")
      .upsert({
        organization_id:claimedInvite.organization_id,
        supplier_profile_id:claimedInvite.supplier_profile_id,
        supplier_party_id:claimedInvite.supplier_party_id,
        auth_user_id:user.id,
        email,
        status:"ACTIVE",
        invitation_id:claimedInvite.id,
        updated_at:acceptedAt,
      },{onConflict:"organization_id,supplier_profile_id,auth_user_id"})
      .select("id")
      .single();

    if(accessError||!access){
      await supabaseAdmin
        .from("supplier_portal_invitations")
        .update({
          status:"PENDING",
          accepted_by_auth_user_id:null,
          accepted_at:null,
        })
        .eq("id",claimedInvite.id)
        .eq("status","ACCEPTED")
        .eq("accepted_by_auth_user_id",user.id)
        .eq("accepted_at",acceptedAt);

      if(accessError) throw accessError;
      throw new Error("Unable to create Supplier Portal access");
    }

    return NextResponse.json({
      success:true,
      accessId:access.id,
      redirect:`/supplier-portal/onboarding?path=invited&accessId=${encodeURIComponent(access.id)}`,
    });
  }catch(error){
    return NextResponse.json({success:false,error:error?.message||"Unable to accept supplier invitation"},{status:500});
  }
}
