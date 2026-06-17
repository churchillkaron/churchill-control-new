import { NextResponse } from "next/server";
import { supabase } from "@/lib/shared/supabase";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const organization_id = searchParams.get("organization_id");

  if (!organization_id)
    return NextResponse.json({ error: "organization_id required" }, { status: 400 });

  const { data, error } = await supabase
    .from("healthcare_medical_records")
    .select("*")
    .eq("organization_id", organization_id)
    .order("visit_date", { ascending: false });

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  await medicalRecordTimeline({ tenantId: body.organization_id, medicalRecord: data });
  return NextResponse.json({ success: true, data });
}

export async function POST(request) {
  const body = await request.json();
  if (!body.organization_id)
    return NextResponse.json({ error: "organization_id required" }, { status: 400 });

  const { data, error } = await supabase
    .from("healthcare_medical_records")
    .insert([body])
    .select();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  await medicalRecordTimeline({ tenantId: body.organization_id, medicalRecord: data });
  return NextResponse.json({ success: true, data });
}
