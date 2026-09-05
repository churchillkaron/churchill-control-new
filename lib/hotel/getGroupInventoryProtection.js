const ACTIVE_BOOKING_STATUSES = Object.freeze(["RESERVED", "CHECKED_IN"]);

function stayDates(from, to) {
  if (!from || !to || to <= from) return [];
  const dates = [];
  const cursor = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  while (cursor < end && dates.length < 370) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

export async function getGroupInventoryProtection({
  supabase,
  organizationId,
  propertyId,
  checkInDate,
  checkOutDate,
  excludeGroupId = null,
}) {
  const dates = stayDates(checkInDate, checkOutDate);
  if (!dates.length) return { dates: [], withheldByRoomType: {}, remainingBlocks: [] };

  const [{ data: blocks, error: blocksError }, { data: rooms, error: roomsError }, { data: bookings, error: bookingsError }] = await Promise.all([
    supabase
      .from("hotel_group_room_blocks")
      .select("id,group_id,room_type,stay_date,allocated_rooms")
      .eq("organization_id", organizationId)
      .eq("property_id", propertyId)
      .eq("deduct_inventory", true)
      .eq("status", "ACTIVE")
      .gte("stay_date", dates[0])
      .lte("stay_date", dates[dates.length - 1]),
    supabase
      .from("hotel_rooms")
      .select("id,room_type")
      .eq("organization_id", organizationId)
      .eq("property_id", propertyId),
    supabase
      .from("hotel_bookings")
      .select("id,group_id,room_id,check_in_date,check_out_date,status")
      .eq("organization_id", organizationId)
      .eq("property_id", propertyId)
      .in("status", ACTIVE_BOOKING_STATUSES)
      .not("group_id", "is", null)
      .lt("check_in_date", checkOutDate)
      .gt("check_out_date", checkInDate),
  ]);

  if (blocksError) throw blocksError;
  if (roomsError) throw roomsError;
  if (bookingsError) throw bookingsError;

  const roomById = new Map((rooms || []).map((room) => [room.id, room]));
  const remainingBlocks = (blocks || []).map((block) => {
    const pickedUp = (bookings || []).filter((booking) => {
      if (booking.group_id !== block.group_id) return false;
      const room = roomById.get(booking.room_id);
      return room?.room_type === block.room_type
        && booking.check_in_date <= block.stay_date
        && booking.check_out_date > block.stay_date;
    }).length;
    return {
      ...block,
      picked_up: pickedUp,
      remaining: Math.max(0, Number(block.allocated_rooms || 0) - pickedUp),
    };
  });

  const withheldPerTypeDate = new Map();
  for (const block of remainingBlocks) {
    if (excludeGroupId && block.group_id === excludeGroupId) continue;
    const key = `${block.room_type}::${block.stay_date}`;
    withheldPerTypeDate.set(key, (withheldPerTypeDate.get(key) || 0) + block.remaining);
  }

  const withheldByRoomType = {};
  for (const [key, value] of withheldPerTypeDate.entries()) {
    const roomType = key.split("::")[0];
    withheldByRoomType[roomType] = Math.max(withheldByRoomType[roomType] || 0, value);
  }

  return { dates, withheldByRoomType, remainingBlocks };
}

export function getOwnGroupBlockCapacity({ remainingBlocks, groupId, roomType, dates }) {
  const matching = (remainingBlocks || []).filter((block) => block.group_id === groupId && block.room_type === roomType);
  if (!matching.length) return { hasDeductBlock: false, complete: false, minRemaining: null };

  const remainingByDate = new Map(matching.map((block) => [block.stay_date, Number(block.remaining || 0)]));
  const complete = (dates || []).every((date) => remainingByDate.has(date));
  const minRemaining = complete ? Math.min(...dates.map((date) => remainingByDate.get(date))) : 0;
  return { hasDeductBlock: true, complete, minRemaining };
}

export default getGroupInventoryProtection;
