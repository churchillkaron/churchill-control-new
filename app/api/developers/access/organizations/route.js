import { NextResponse } from "next/server";
import { getServerCurrentUser } from "@/lib/auth/getServerCurrentUser";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
export const dynamic="force-dynamic";
export async function GET(){
  try{
    const user=await getServerCurrentUser();
    if(!user?.id) return NextResponse.json({success:false,error:"Authentication required"},{status:401});
    const {data:access,error}=await supabaseAdmin.from("developer_portal_access").select("id,organization_id,email,name,role,permissions,status").eq("auth_user_id",user.id).eq("status","ACTIVE");
    if(error) throw error;
    const orgIds=[...new Set((access||[]).map(row=>row.organization_id).filter(Boolean))];
    const {data:organizations,error:orgError}=orgIds.length?await supabaseAdmin.from("organizations").select("id,name,legal_name,status,organization_status").in("id",orgIds):{data:[],error:null};
    if(orgError) throw orgError;
    const byId=new Map((organizations||[]).map(org=>[String(org.id),org]));
    return NextResponse.json({success:true,organizations:(access||[]).map(row=>({...row,organization:byId.get(String(row.organization_id))||null})).filter(row=>row.organization?.organization_status==="ACTIVE"&&row.organization?.status!=="setup_failed")});
  }catch(error){return NextResponse.json({success:false,error:error?.message||"Unable to load developer organizations"},{status:500});}
}
