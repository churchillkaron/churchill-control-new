import { createHash, randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getServerCurrentUser } from "@/lib/auth/getServerCurrentUser";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { requireOnboardingIndustry } from "@/lib/onboarding/getOnboardingIndustryOptions";
import { requireWorkspaceTemplate } from "@/lib/onboarding/buildWorkspaceFromTemplate";
import { WalletRuntime } from "@/lib/platform/service-runtime/wallet/runtime/WalletRuntime";
import { bootstrapOrganizationServices } from "@/lib/platform/service-runtime/services/bootstrap/bootstrapOrganizationServices";

export const dynamic = "force-dynamic";
const hash = (value) => createHash("sha256").update(String(value)).digest("hex");
const OWNER_ROLES = new Set(["OWNER","ORGANIZATION_OWNER","ORG_OWNER","PLATFORM_OWNER","SUPER_ADMIN"]);

function clean(value){ return String(value ?? "").trim(); }
function ownerRole(value){ return OWNER_ROLES.has(clean(value).toUpperCase()); }

async function loadClaim(token){
  const {data,error}=await supabaseAdmin
    .from("accounting_managed_clients")
    .select("*")
    .eq("claim_token_hash",hash(token))
    .maybeSingle();
  if(error) throw error;
  return data || null;
}
async function ensureOwnerStaffCandidate({user,name}){
  const email=clean(user.email).toLowerCase();
  const fields="id,email,auth_user_id,party_id,role,active,active_organization_id";
  const {data:existing,error}=await supabaseAdmin
    .from("staff_accounts")
    .select(fields)
    .eq("auth_user_id",user.id)
    .limit(2);
  if(error) throw error;
  if((existing||[]).length>1) throw new Error("Multiple Staff identities are linked to this account");
  let staff=(existing||[])[0]||null;

  if(staff){
    if(clean(staff.email).toLowerCase()!==email) throw new Error("Staff identity email does not match the authenticated account");
    if(staff.active && !ownerRole(staff.role)) throw new Error("Claiming a managed company requires owner-level identity");
    if(!staff.active && (staff.role||staff.party_id||staff.active_organization_id)){
      throw new Error("Inactive Staff identity cannot be reused for a managed company claim");
    }
    return staff;
  }

  const candidate={
    email,
    name:name||email.split("@")[0],
    auth_user_id:user.id,
    role:null,
    position:null,
    department:null,
    active:false,
    active_organization_id:null,
    payroll_country:null,
    payroll_currency:null,
    salary_type:null,
    payroll_frequency:null,
  };
  let inserted=await supabaseAdmin.from("staff_accounts").insert(candidate).select(fields).maybeSingle();
  if(inserted.error?.code==="23505"){
    inserted=await supabaseAdmin.from("staff_accounts").select(fields).eq("email",email).maybeSingle();
    if(inserted.error) throw inserted.error;
    if(!inserted.data||String(inserted.data.auth_user_id)!==String(user.id)){
      throw new Error("Staff identity email is already linked to another account");
    }
    if(inserted.data.active||inserted.data.role||inserted.data.party_id||inserted.data.active_organization_id){
      throw new Error("Concurrent Staff identity is not a neutral claim candidate");
    }
  }else if(inserted.error){
    throw inserted.error;
  }
  if(!inserted.data?.id) throw new Error("Unable to prepare managed company owner identity");
  return inserted.data;
}
async function ensureWorkspace({organizationId,industry,installedBy}){
  const template=await requireWorkspaceTemplate(industry);
  const assignment=await supabaseAdmin.from("organization_template_assignments").select("id,template_id").eq("organization_id",organizationId).maybeSingle();
  if(assignment.error) throw assignment.error;
  if(!assignment.data){
    const inserted=await supabaseAdmin.from("organization_template_assignments").insert({
      organization_id:organizationId,
      template_id:template.id,
      installed_by:installedBy,
    });
    if(inserted.error) throw inserted.error;
  }else if(String(assignment.data.template_id)!==String(template.id)){
    throw new Error("Managed client already has a different workspace template");
  }

  const modules=await supabaseAdmin.from("workspace_template_modules").select("module_id").eq("template_id",template.id);
  if(modules.error) throw modules.error;
  const existing=await supabaseAdmin.from("organization_modules").select("module_id").eq("organization_id",organizationId);
  if(existing.error) throw existing.error;
  const existingIds=new Set((existing.data||[]).map(row=>String(row.module_id)));
  const missing=(modules.data||[]).filter(row=>!existingIds.has(String(row.module_id))).map(row=>({
    organization_id:organizationId,module_id:row.module_id,status:"active",
  }));
  if(missing.length){
    const inserted=await supabaseAdmin.from("organization_modules").insert(missing);
    if(inserted.error) throw inserted.error;
  }
  const settings=await supabaseAdmin.from("organization_workspace_settings").select("organization_id").eq("organization_id",organizationId).maybeSingle();
  if(settings.error) throw settings.error;
  if(!settings.data){
    const inserted=await supabaseAdmin.from("organization_workspace_settings").insert({
      organization_id:organizationId,
      metric_cards:[],
      alerts:[],
      favorite_modules:[],
      layout:{theme:"light",density:"comfortable"},
    });
    if(inserted.error) throw inserted.error;
  }
  return {templateId:template.id,modulesInstalled:(modules.data||[]).length};
}

export async function GET(_request,{params}){
  try{
    const {token}=await params;
    const claim=await loadClaim(token);
    if(!claim) return NextResponse.json({success:false,error:"Claim invitation not found"},{status:404});
    const expired=!claim.claim_expires_at||new Date(claim.claim_expires_at).getTime()<=Date.now();
    const claimingStartedAt=new Date(claim.claiming_started_at||0).getTime();
    const retryableClaiming=claim.management_status==="CLAIMING"&&Number.isFinite(claimingStartedAt)&&claimingStartedAt>0&&claimingStartedAt<=Date.now()-15*60*1000&&Boolean(claim.claiming_attempt_id);
    const user=await getServerCurrentUser();
    const [{data:client,error:clientError},{data:firm,error:firmError},{data:relationship,error:relationshipError}]=await Promise.all([
      supabaseAdmin.from("organizations").select("id,name,legal_name,country").eq("id",claim.client_organization_id).maybeSingle(),
      supabaseAdmin.from("organizations").select("id,name,legal_name").eq("id",claim.firm_organization_id).maybeSingle(),
      supabaseAdmin.from("organization_clients").select("id,relationship_status").eq("id",claim.organization_client_relationship_id).maybeSingle(),
    ]);
    if(clientError) throw clientError;if(firmError) throw firmError;if(relationshipError) throw relationshipError;
    if(!relationship||relationship.relationship_status!=="active") return NextResponse.json({success:false,error:"Accounting relationship is no longer active"},{status:410});
    return NextResponse.json({success:true,claim:{
      status:expired&&claim.management_status==="CLAIM_PENDING"?"EXPIRED":claim.management_status,
      expiresAt:claim.claim_expires_at,
      email:claim.claim_email,
      client,
      firmName:firm?.name||firm?.legal_name||"Accounting firm",
      retryable:retryableClaiming,
    },authenticated:Boolean(user?.id),emailMatches:Boolean(user?.email&&clean(user.email).toLowerCase()===clean(claim.claim_email).toLowerCase())});
  }catch(error){
    return NextResponse.json({success:false,error:error?.message||"Unable to load managed client claim"},{status:500});
  }
}
export async function POST(request,{params}){
  let reservedClaimId=null;
  let reservedUserId=null;
  let reservedAttemptId=null;
  try{
    const user=await getServerCurrentUser();
    if(!user?.id||!user?.email) return NextResponse.json({success:false,error:"Authentication required"},{status:401});
    const {token}=await params;
    let claim=await loadClaim(token);
    if(!claim) return NextResponse.json({success:false,error:"Claim invitation not found"},{status:404});
    const relationshipCheck=await supabaseAdmin.from("organization_clients").select("id,relationship_status").eq("id",claim.organization_client_relationship_id).maybeSingle();
    if(relationshipCheck.error) throw relationshipCheck.error;
    if(!relationshipCheck.data||relationshipCheck.data.relationship_status!=="active") return NextResponse.json({success:false,error:"Accounting relationship is no longer active"},{status:410});
    if(!claim.claim_expires_at||new Date(claim.claim_expires_at).getTime()<=Date.now()) return NextResponse.json({success:false,error:"Claim invitation has expired"},{status:410});
    if(clean(user.email).toLowerCase()!==clean(claim.claim_email).toLowerCase()) return NextResponse.json({success:false,error:"Sign in with the email address that received this claim invitation"},{status:403});
    if(claim.management_status==="CLAIMING"){
      const startedAt=new Date(claim.claiming_started_at||0).getTime();
      const stale=Number.isFinite(startedAt)&&startedAt>0&&startedAt<=Date.now()-15*60*1000;
      if(!stale||!claim.claiming_attempt_id) return NextResponse.json({success:false,error:"Managed client claim is already being processed"},{status:409});
      const recovered=await supabaseAdmin.from("accounting_managed_clients").update({
        management_status:"CLAIM_PENDING",
        claiming_by_auth_user_id:null,
        claiming_attempt_id:null,
        claiming_started_at:null,
        updated_at:new Date().toISOString(),
      }).eq("id",claim.id).eq("management_status","CLAIMING").eq("claiming_attempt_id",claim.claiming_attempt_id).eq("claim_token_hash",hash(token)).select("*").maybeSingle();
      if(recovered.error) throw recovered.error;
      if(!recovered.data) return NextResponse.json({success:false,error:"Managed client claim state changed; reload and try again"},{status:409});
      claim=recovered.data;
    }
    if(claim.management_status!=="CLAIM_PENDING") return NextResponse.json({success:false,error:`Claim invitation is ${String(claim.management_status).toLowerCase()}`},{status:409});

    const body=await request.json().catch(()=>({}));
    const industry=clean(body?.industry).toLowerCase();
    const ownerName=clean(body?.ownerName||user.user_metadata?.full_name||"");
    if(!industry||!ownerName) return NextResponse.json({success:false,error:"Business type and owner name are required"},{status:400});
    const governed=await requireOnboardingIndustry(industry);
    if(governed.organizationType==="accounting_firm") return NextResponse.json({success:false,error:"A managed accounting client cannot be activated as an accounting-firm organization"},{status:409});

    const organizationId=claim.client_organization_id;
    if(String(organizationId)===String(claim.firm_organization_id)) return NextResponse.json({success:false,error:"Managed client organization boundary is invalid"},{status:409});

    const claimingAt=new Date().toISOString();
    const claimingAttemptId=randomUUID();
    const reservation=await supabaseAdmin.from("accounting_managed_clients").update({
      management_status:"CLAIMING",
      claiming_by_auth_user_id:user.id,
      claiming_attempt_id:claimingAttemptId,
      claiming_started_at:claimingAt,
      updated_at:claimingAt,
    }).eq("id",claim.id).eq("management_status","CLAIM_PENDING").eq("claim_token_hash",hash(token)).gt("claim_expires_at",claimingAt).select("id,claiming_attempt_id").maybeSingle();
    if(reservation.error) throw reservation.error;
    if(!reservation.data?.id) return NextResponse.json({success:false,error:"Managed client claim is already being processed"},{status:409});
    reservedClaimId=reservation.data.id;
    reservedUserId=user.id;
    reservedAttemptId=reservation.data.claiming_attempt_id;

    const workspace=await ensureWorkspace({organizationId,industry,installedBy:user.email});
    const entityResult=await supabaseAdmin.from("legal_entities").select("id,currency").eq("organization_id",organizationId).eq("is_default_accounting_entity",true).maybeSingle();
    if(entityResult.error) throw entityResult.error;
    if(!entityResult.data?.id) throw new Error("Managed client legal entity is missing");
    const wallet=await WalletRuntime.getOrCreate({organization_id:organizationId,currency:entityResult.data.currency});
    const services=await bootstrapOrganizationServices({organization_id:organizationId,industry_id:industry,managed_by:"avantiqo"});

    const staff=await ensureOwnerStaffCandidate({user,name:ownerName});
    const finalized=await supabaseAdmin.rpc("finalize_accounting_managed_client_claim",{
      p_claim_id:claim.id,
      p_auth_user_id:user.id,
      p_claiming_attempt_id:reservedAttemptId,
      p_staff_account_id:staff.id,
      p_owner_name:ownerName,
      p_owner_email:clean(user.email).toLowerCase(),
      p_organization_id:organizationId,
      p_industry:industry,
      p_organization_type:governed.organizationType,
      p_token_hash:hash(token),
    });
    if(finalized.error) throw finalized.error;
    const finalRow=Array.isArray(finalized.data)?finalized.data[0]||null:finalized.data||null;
    if(!finalRow?.claim_id) throw new Error("Managed client claim did not finalize");

    return NextResponse.json({
      success:true,
      organizationId,
      redirect:`/workspace/${organizationId}`,
      workspace,
      wallet,
      services,
      owner:{staff,partyId:finalRow.party_id},
      claim:finalRow,
    });
  }catch(error){
    if(reservedClaimId&&reservedUserId&&reservedAttemptId){
      await supabaseAdmin.from("accounting_managed_clients").update({
        management_status:"CLAIM_PENDING",
        claiming_by_auth_user_id:null,
        claiming_attempt_id:null,
        claiming_started_at:null,
        updated_at:new Date().toISOString(),
      }).eq("id",reservedClaimId).eq("management_status","CLAIMING").eq("claiming_by_auth_user_id",reservedUserId).eq("claiming_attempt_id",reservedAttemptId);
    }
    return NextResponse.json({success:false,error:error?.message||"Unable to claim managed client"},{status:500});
  }
}
