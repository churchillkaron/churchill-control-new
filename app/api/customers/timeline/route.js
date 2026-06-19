import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin.js";

export async function GET(req) {
  const organization_id = req.nextUrl.searchParams.get("organization_id");
  if (!organization_id) return NextResponse.json({ error: "organization_id required" }, { status: 400 });

  const { data: customers, error: cErr } = await supabaseAdmin
    .from("organization_clients")
    .select("*")
    .eq("organization_id", organization_id);

  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });

  const timeline = [];

  for (const customer of customers) {
    const [bookings, appointments, admissions, invoices, payments, medicalRecords] = await Promise.all([
      supabaseAdmin.from("hotel_bookings").select("*").eq("guest_id", customer.source_id),
      supabaseAdmin.from("healthcare_appointments").select("*").eq("patient_id", customer.source_id),
      supabaseAdmin.from("healthcare_admissions").select("*").eq("patient_id", customer.source_id),
      supabaseAdmin.from("invoices").select("*").eq("customer_id", customer.source_id),
      supabaseAdmin.from('payment_transactions').select("*").eq("customer_id", customer.source_id),
      supabaseAdmin.from("healthcare_medical_records").select("*").eq("patient_id", customer.source_id)
    ]);

    timeline.push({
      customerId: customer.id,
      events: [
        ...(bookings.data || []).map(b => ({ type: "booking", date: b.check_in_date, details: b })),
        ...(appointments.data || []).map(a => ({ type: "appointment", date: a.appointment_datetime, details: a })),
        ...(admissions.data || []).map(a => ({ type: "admission", date: a.admission_date, details: a })),
        ...(invoices.data || []).map(i => ({ type: "invoice", date: i.created_at, details: i })),
        ...(payments.data || []).map(p => ({ type: "payment", date: p.created_at, details: p })),
        ...(medicalRecords.data || []).map(m => ({ type: "medical_record", date: m.visit_date, details: m }))
      ].sort((x, y) => new Date(x.date) - new Date(y.date))
    });
  }

  return NextResponse.json({ success: true, timeline });
}
