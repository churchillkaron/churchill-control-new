import { NextResponse } from "next/server";

import { evaluateHotelArrivalReadiness } from "@/lib/hotel/server/getHotelArrivalReadiness";
import { evaluateHotelDepartureReadiness } from "@/lib/hotel/server/getHotelDepartureReadiness";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const dynamic = "force-dynamic";

const ACTIVE_TURNOVER_STATUSES = Object.freeze(["PENDING", "IN_PROGRESS", "AWAITING_INSPECTION"]);

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get("organizationId") || searchParams.get("organization_id");

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }

    const { data, error } = await supabaseAdmin
      .from("hotel_bookings")
      .select(`
        *,
        hotel_rooms (
          room_number,
          room_type,
          status
        ),
        hotel_guests (
          full_name,
          identity_verified_at
        )
      `)
      .eq("organization_id", access.organizationId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const bookingRows = data || [];
    const bookingIds = bookingRows.map((booking) => booking.id).filter(Boolean);
    const roomIds = [...new Set(bookingRows.map((booking) => booking.room_id).filter(Boolean))];
    const turnoverByRoomId = new Map();
    const folioByBookingId = new Map();
    const linesByFolioId = new Map();
    const transactionsByBookingId = new Map();

    if (roomIds.length) {
      const { data: turnoverTasks, error: turnoverError } = await supabaseAdmin
        .from("hotel_housekeeping_tasks")
        .select("id,room_id,booking_id,task_type,task_status,scheduled_at,updated_at")
        .eq("organization_id", access.organizationId)
        .in("room_id", roomIds)
        .in("task_status", ACTIVE_TURNOVER_STATUSES)
        .order("updated_at", { ascending: false });
      if (turnoverError) throw turnoverError;
      for (const task of turnoverTasks || []) {
        if (task.room_id && !turnoverByRoomId.has(task.room_id)) turnoverByRoomId.set(task.room_id, task);
      }
    }

    if (bookingIds.length) {
      const [{ data: folios, error: folioError }, { data: transactions, error: transactionError }] = await Promise.all([
        supabaseAdmin
          .from("hotel_folios")
          .select("id,booking_id,currency_code,status,closed_at")
          .eq("organization_id", access.organizationId)
          .in("booking_id", bookingIds),
        supabaseAdmin
          .from("hotel_payment_transactions")
          .select("booking_id,status,transaction_type,processor_mode,finance_payment_id,amount,applied_amount,refunded_amount,currency_code")
          .eq("organization_id", access.organizationId)
          .in("booking_id", bookingIds),
      ]);
      if (folioError) throw folioError;
      if (transactionError) throw transactionError;

      for (const folio of folios || []) folioByBookingId.set(folio.booking_id, folio);
      for (const transaction of transactions || []) {
        if (!transactionsByBookingId.has(transaction.booking_id)) transactionsByBookingId.set(transaction.booking_id, []);
        transactionsByBookingId.get(transaction.booking_id).push(transaction);
      }

      const folioIds = (folios || []).map((folio) => folio.id).filter(Boolean);
      if (folioIds.length) {
        const { data: folioLines, error: linesError } = await supabaseAdmin
          .from("hotel_folio_lines")
          .select("folio_id,amount,tax_amount,voided_at")
          .eq("organization_id", access.organizationId)
          .in("folio_id", folioIds);
        if (linesError) throw linesError;
        for (const line of folioLines || []) {
          if (!linesByFolioId.has(line.folio_id)) linesByFolioId.set(line.folio_id, []);
          linesByFolioId.get(line.folio_id).push(line);
        }
      }
    }

    const bookings = bookingRows.map((booking) => {
      const folio = folioByBookingId.get(booking.id) || null;
      return {
        ...booking,
        room_turnover: booking.room_id ? turnoverByRoomId.get(booking.room_id) || null : null,
        arrival_readiness: evaluateHotelArrivalReadiness(booking),
        departure_readiness: evaluateHotelDepartureReadiness({
          booking,
          folio,
          folioLines: folio ? linesByFolioId.get(folio.id) || [] : [],
          transactions: transactionsByBookingId.get(booking.id) || [],
        }),
      };
    });

    return NextResponse.json({ success: true, bookings });
  } catch (error) {
    console.error("HOTEL_BOOKING_LIST_ERROR", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Booking lookup failed" },
      { status: 500 },
    );
  }
}
