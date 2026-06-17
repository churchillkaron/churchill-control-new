import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function buildHotelMetrics({ organizationId }) {
  const today = new Date().toISOString().slice(0, 10);

  const [
    bookingsResponse,
    roomsResponse,
    housekeepingResponse,
    maintenanceResponse,
    conciergeResponse,
  ] = await Promise.all([
    supabaseAdmin.from("hotel_bookings").select("*").eq("organization_id", organizationId),
    supabaseAdmin.from("hotel_rooms").select("*").eq("organization_id", organizationId),
    supabaseAdmin.from("hotel_housekeeping_tasks").select("*").eq("organization_id", organizationId),
    supabaseAdmin.from("hotel_maintenance_tasks").select("*").eq("organization_id", organizationId),
    supabaseAdmin.from("hotel_concierge_requests").select("*").eq("organization_id", organizationId),
  ]);

  const error =
    bookingsResponse.error ||
    roomsResponse.error ||
    housekeepingResponse.error ||
    maintenanceResponse.error ||
    conciergeResponse.error;

  if (error) return { success: false, error: error.message, metrics: {} };

  const bookings = bookingsResponse.data || [];
  const rooms = roomsResponse.data || [];
  const housekeeping = housekeepingResponse.data || [];
  const maintenance = maintenanceResponse.data || [];
  const concierge = conciergeResponse.data || [];

  const totalRooms = rooms.length;
  const occupiedRooms = bookings.filter(b => b.status === "CHECKED_IN").length;
  const arrivalsToday = bookings.filter(b => b.check_in_date === today).length;
  const departuresToday = bookings.filter(b => b.check_out_date === today).length;
  const pendingHousekeeping = housekeeping.filter(t => t.task_status !== "COMPLETED").length;
  const openMaintenance = maintenance.filter(t => t.status !== "COMPLETED").length;
  const openConcierge = concierge.filter(r => r.status !== "COMPLETED").length;
  const availableRooms = Math.max(totalRooms - occupiedRooms, 0);
  const occupancy = totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0;
  const revenueToday = bookings.reduce((sum, b) => sum + Number(b.total_amount || 0), 0);
  const adr = occupiedRooms > 0 ? Math.round(revenueToday / occupiedRooms) : 0;
  const revpar = totalRooms > 0 ? Math.round(revenueToday / totalRooms) : 0;

  return {
    success: true,
    metrics: {
      totalRooms,
      occupiedRooms,
      availableRooms,
      occupancy,
      arrivalsToday,
      departuresToday,
      pendingHousekeeping,
      openMaintenance,
      openConcierge,
      revenueToday,
      adr,
      revpar,
    },
  };
}
