import { NextResponse } from "next/server";
import { supabase } from "@/lib/shared/supabase";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const organization_id = searchParams.get("organization_id");

  if (!organization_id)
    return NextResponse.json({ error: "organization_id required" }, { status: 400 });

  const [patients, appointments, admissions, beds] = await Promise.all([
    supabase.from("healthcare_patients").select("id").eq("organization_id", organization_id),
    supabase.from("healthcare_appointments").select("id").eq("organization_id", organization_id),
    supabase.from("healthcare_admissions").select("id").eq("organization_id", organization_id),
    supabase.from("healthcare_beds").select("id").eq("organization_id", organization_id),
  ]);

  return NextResponse.json({
    success: true,
    metrics: {
      patients: patients.data?.length || 0,
      appointments: appointments.data?.length || 0,
      admissions: admissions.data?.length || 0,
      beds: beds.data?.length || 0,
    },
  });
}
