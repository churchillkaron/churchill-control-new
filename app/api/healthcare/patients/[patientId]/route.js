import { NextResponse } from "next/server";
import { supabase } from "@/lib/shared/supabase";

export async function GET(req, { params }) {
  const { patientId } = req.nextUrl.params;
  const { data, error } = await supabase
    .from("healthcare_patients")
    .select("*")
    .eq("id", patientId)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data });
}

export async function PUT(req, { params }) {
  const { patientId } = req.nextUrl.params;
  const body = await req.json();
  const { data, error } = await supabase
    .from("healthcare_patients")
    .update(body)
    .eq("id", patientId)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data });
}

export async function DELETE(req, { params }) {
  const { patientId } = req.nextUrl.params;
  const { data, error } = await supabase
    .from("healthcare_patients")
    .delete()
    .eq("id", patientId)
    .select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data });
}
