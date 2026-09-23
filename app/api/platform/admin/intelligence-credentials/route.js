import { NextResponse } from "next/server";
import { getServerCurrentUser } from "@/lib/auth/getServerCurrentUser";

export const dynamic = "force-dynamic";

async function requireUser(){
  const user=await getServerCurrentUser();
  if(!user?.id) return null;
  return user;
}

export async function GET(){
  const user=await requireUser();
  if(!user) return NextResponse.json({success:false,error:"Authentication required"},{status:401});
  return NextResponse.json({
    success:true,
    retired:true,
    policy:"LOCAL_ONLY",
    infrastructure_provider:"AVANTIQO_LOCAL_NODE_V1",
    modal_credentials_supported:false,
    message:"Cloud Intelligence credentials are retired. Avantiqo Intelligence executes only on owned local compute.",
  });
}

export async function POST(){
  const user=await requireUser();
  if(!user) return NextResponse.json({success:false,error:"Authentication required"},{status:401});
  return NextResponse.json({
    success:false,
    retired:true,
    error:"AVANTIQO_CLOUD_INTELLIGENCE_CREDENTIALS_RETIRED_LOCAL_ONLY",
  },{status:410});
}
