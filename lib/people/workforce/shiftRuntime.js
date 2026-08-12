import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { loadOrganizationPolicy } from "@/lib/platform/security/organizationAccessPolicy";
import {
  localDateString,
  resolveOrganizationTimeContext,
  scheduleWindow,
} from "@/lib/shared/time/organizationTime";

function optionalNonNegativeInteger(value) {
  if (value === null || value === undefined || value === "") return null;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return null;

  return parsed;
}

function optionalFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function minutesBetween(startValue, endValue) {
  if (!startValue || !endValue) return 0;

  const start = new Date(startValue);
  const end = new Date(endValue);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 0;
  }

  return Math.max(0, Math.round((end - start) / 60000));
}

function distanceMeters(lat1, lon1, lat2, lon2) {
  const earthRadiusMeters = 6371000;
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(deltaLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMeters * c;
}

async function loadWorkforceSettings(organizationId) {
  const policy = await loadOrganizationPolicy({ organizationId });
  const settings = policy.workforce || {};

  return {
    earlyStartMinutes: optionalNonNegativeInteger(
      settings?.early_clock_in_minutes
    ),
    lateThresholdMinutes: optionalNonNegativeInteger(
      settings?.late_threshold_minutes
    ),
    gpsClockInRequired: settings?.gps_clock_in_required === true,
    clockInSiteLatitude: optionalFiniteNumber(settings?.clock_in_site_latitude),
    clockInSiteLongitude: optionalFiniteNumber(settings?.clock_in_site_longitude),
    clockInRadiusMeters: optionalFiniteNumber(settings?.clock_in_radius_meters),
    locationAccuracyMaxMeters: optionalFiniteNumber(
      settings?.location_accuracy_max_meters
    ),
  };
}

export async function loadClockInRequirements({ organizationId }) {
  const settings = await loadWorkforceSettings(organizationId);
  return {
    gpsRequired: settings.gpsClockInRequired,
    geofenceConfigured:
      settings.clockInSiteLatitude !== null &&
      settings.clockInSiteLongitude !== null &&
      settings.clockInRadiusMeters !== null,
    maxAccuracyMeters: settings.locationAccuracyMaxMeters,
  };
}

function verifyClockInLocation({
  location,
  settings,
  now,
  gpsExceptionApproved = false,
}) {
  if (gpsExceptionApproved && !location) return null;
  if (!settings.gpsClockInRequired && !location) return null;

  if (!location || typeof location !== "object") {
    const error = new Error("GPS location is required to start this shift");
    error.status = 400;
    error.code = "CLOCK_IN_GPS_REQUIRED";
    throw error;
  }

  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  const accuracy = Number(location.accuracy);
  const capturedAt = new Date(location.capturedAt || location.timestamp || 0);

  if (
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180 ||
    !Number.isFinite(accuracy) ||
    accuracy < 0
  ) {
    const error = new Error("Valid GPS coordinates are required to start this shift");
    error.status = 400;
    error.code = "CLOCK_IN_GPS_INVALID";
    throw error;
  }

  if (Number.isNaN(capturedAt.getTime())) {
    const error = new Error("GPS capture time is invalid");
    error.status = 400;
    error.code = "CLOCK_IN_GPS_INVALID";
    throw error;
  }

  const ageMs = now.getTime() - capturedAt.getTime();
  if (ageMs > 5 * 60 * 1000 || ageMs < -60 * 1000) {
    const error = new Error("GPS location is stale. Capture your location again");
    error.status = 400;
    error.code = "CLOCK_IN_GPS_STALE";
    throw error;
  }

  if (
    settings.locationAccuracyMaxMeters !== null &&
    accuracy > settings.locationAccuracyMaxMeters
  ) {
    const error = new Error(
      `GPS accuracy must be within ${Math.round(settings.locationAccuracyMaxMeters)} meters`
    );
    error.status = 400;
    error.code = "CLOCK_IN_GPS_ACCURACY_LOW";
    throw error;
  }

  let distanceFromSiteMeters = null;
  let withinGeofence = null;

  if (
    settings.clockInSiteLatitude !== null &&
    settings.clockInSiteLongitude !== null &&
    settings.clockInRadiusMeters !== null
  ) {
    distanceFromSiteMeters = distanceMeters(
      latitude,
      longitude,
      settings.clockInSiteLatitude,
      settings.clockInSiteLongitude
    );
    withinGeofence = distanceFromSiteMeters <= settings.clockInRadiusMeters;

    if (!withinGeofence) {
      const error = new Error(
        `You must be within ${Math.round(settings.clockInRadiusMeters)} meters of the work site to start your shift`
      );
      error.status = 403;
      error.code = "CLOCK_IN_OUTSIDE_GEOFENCE";
      throw error;
    }
  }

  return {
    latitude,
    longitude,
    accuracy,
    capturedAt: capturedAt.toISOString(),
    distanceFromSiteMeters,
    withinGeofence,
  };
}

export async function loadTodaySchedule({
  organizationId,
  staffId,
  timezone,
  now = new Date(),
}) {
  if (!organizationId || !staffId) {
    throw new Error("organizationId and staffId required");
  }

  const shiftDate = localDateString(now, timezone || "UTC");

  const { data, error } = await supabaseAdmin
    .from("staff_schedules")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("staff_id", staffId)
    .eq("shift_date", shiftDate)
    .eq("status", "PUBLISHED")
    .order("start_time", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function loadOpenShift({ organizationId, staffId }) {
  if (!organizationId || !staffId) {
    throw new Error("organizationId and staffId required");
  }

  const { data, error } = await supabaseAdmin
    .from("staff_shifts")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("staff_id", staffId)
    .is("clock_out", null)
    .order("clock_in", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function loadStaffWorkday({
  organizationId,
  staffId,
  entityId = null,
  now = new Date(),
}) {
  const timeContext = await resolveOrganizationTimeContext({
    organizationId,
    entityId,
  });

  const [schedule, openShift] = await Promise.all([
    loadTodaySchedule({
      organizationId,
      staffId,
      timezone: timeContext.timezone,
      now,
    }),
    loadOpenShift({
      organizationId,
      staffId,
    }),
  ]);

  return {
    timezone: timeContext.timezone,
    currency: timeContext.currency,
    businessDate: localDateString(now, timeContext.timezone),
    schedule,
    openShift,
  };
}

async function createAttendanceFromShift({
  organizationId,
  staff,
  schedule,
  shift,
  scheduleTiming,
  businessDate,
  lateMinutes,
  locationEvidence,
}) {
  const { data, error } = await supabaseAdmin
    .from("staff_attendance")
    .insert({
      organization_id: organizationId,
      party_id: staff.party_id || null,
      staff_id: staff.id,
      staff_name: staff.name || staff.email || "Staff",
      shift_date: businessDate,
      schedule_id: schedule?.id || null,
      shift_id: shift.id,
      scheduled_start: scheduleTiming?.startIso || null,
      scheduled_end: scheduleTiming?.endIso || null,
      actual_start: shift.clock_in,
      late_minutes: lateMinutes,
      attendance_status: "PRESENT",
      clock_in_latitude: locationEvidence?.latitude ?? null,
      clock_in_longitude: locationEvidence?.longitude ?? null,
      clock_in_accuracy_meters: locationEvidence?.accuracy ?? null,
      clock_in_distance_meters: locationEvidence?.distanceFromSiteMeters ?? null,
      clock_in_location_captured_at: locationEvidence?.capturedAt ?? null,
      clock_in_location_verified: locationEvidence ? true : null,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function clockInStaff({
  organizationId,
  staff,
  entityId = null,
  location = null,
  gpsExceptionApproved = false,
  now = new Date(),
}) {
  if (!organizationId || !staff?.id) {
    throw new Error("organizationId and staff required");
  }

  const existingShift = await loadOpenShift({
    organizationId,
    staffId: staff.id,
  });

  if (existingShift) {
    const error = new Error("An active shift already exists");
    error.status = 409;
    throw error;
  }

  const timeContext = await resolveOrganizationTimeContext({
    organizationId,
    entityId,
  });

  const workforceSettings = await loadWorkforceSettings(organizationId);
  const locationEvidence = verifyClockInLocation({
    location,
    settings: workforceSettings,
    now,
    gpsExceptionApproved,
  });
  const businessDate = localDateString(now, timeContext.timezone);
  const schedule = await loadTodaySchedule({
    organizationId,
    staffId: staff.id,
    timezone: timeContext.timezone,
    now,
  });

  const scheduleTiming = schedule
    ? scheduleWindow({
        shiftDate: schedule.shift_date,
        startTime: schedule.start_time,
        endTime: schedule.end_time,
        timezone: timeContext.timezone,
      })
    : null;

  let lateMinutes = 0;
  let isLate = false;

  if (scheduleTiming?.start) {
    if (workforceSettings.earlyStartMinutes !== null) {
      const earliestStart = new Date(
        scheduleTiming.start.getTime() -
          workforceSettings.earlyStartMinutes * 60000
      );

      if (now < earliestStart) {
        const error = new Error("Too early to start shift");
        error.status = 400;
        throw error;
      }
    }

    lateMinutes = Math.max(
      0,
      Math.floor((now.getTime() - scheduleTiming.start.getTime()) / 60000)
    );

    isLate =
      workforceSettings.lateThresholdMinutes === null
        ? null
        : lateMinutes > workforceSettings.lateThresholdMinutes;
  }

  const { data: shift, error: shiftError } = await supabaseAdmin
    .from("staff_shifts")
    .insert({
      organization_id: organizationId,
      party_id: staff.party_id || null,
      staff_id: staff.id,
      schedule_id: schedule?.id || null,
      staff_name: staff.name || staff.email || "Staff",
      staff_role: staff.role || staff.position || "STAFF",
      clock_in: now.toISOString(),
      is_valid: true,
      is_late: isLate,
      late_minutes: lateMinutes,
      penalty_multiplier: 1,
      scheduled_start: schedule?.start_time || null,
      scheduled_end: schedule?.end_time || null,
      shift_source: schedule ? "SCHEDULED" : "UNSCHEDULED",
      approval_status: schedule ? "APPROVED" : "PENDING",
      shift_status: "ACTIVE",
      clock_in_latitude: locationEvidence?.latitude ?? null,
      clock_in_longitude: locationEvidence?.longitude ?? null,
      clock_in_accuracy_meters: locationEvidence?.accuracy ?? null,
      clock_in_distance_meters: locationEvidence?.distanceFromSiteMeters ?? null,
      clock_in_location_captured_at: locationEvidence?.capturedAt ?? null,
      clock_in_location_verified: locationEvidence ? true : null,
    })
    .select("*")
    .single();

  if (shiftError) throw shiftError;

  let attendance = null;

  try {
    attendance = await createAttendanceFromShift({
      organizationId,
      staff,
      schedule,
      shift,
      scheduleTiming,
      businessDate,
      lateMinutes,
      locationEvidence,
    });
  } catch (attendanceError) {
    await supabaseAdmin
      .from("staff_shifts")
      .delete()
      .eq("id", shift.id)
      .eq("organization_id", organizationId)
      .eq("staff_id", staff.id);

    throw attendanceError;
  }

  return {
    timezone: timeContext.timezone,
    businessDate,
    schedule,
    shift,
    attendance,
    late: isLate,
    lateMinutes,
    locationVerified: Boolean(locationEvidence),
    gpsExceptionUsed: Boolean(gpsExceptionApproved),
  };
}

export async function clockOutStaff({
  organizationId,
  staff,
  entityId = null,
  now = new Date(),
}) {
  if (!organizationId || !staff?.id) {
    throw new Error("organizationId and staff required");
  }

  const openShift = await loadOpenShift({
    organizationId,
    staffId: staff.id,
  });

  if (!openShift) {
    const error = new Error("No open shift found");
    error.status = 400;
    throw error;
  }

  const timeContext = await resolveOrganizationTimeContext({
    organizationId,
    entityId,
  });

  const workedMinutes = minutesBetween(openShift.clock_in, now.toISOString());

  let scheduledMinutes = null;

  if (openShift.schedule_id) {
    const { data: schedule, error: scheduleError } = await supabaseAdmin
      .from("staff_schedules")
      .select("*")
      .eq("id", openShift.schedule_id)
      .eq("organization_id", organizationId)
      .eq("staff_id", staff.id)
      .maybeSingle();

    if (scheduleError) throw scheduleError;

    const timing = schedule
      ? scheduleWindow({
          shiftDate: schedule.shift_date,
          startTime: schedule.start_time,
          endTime: schedule.end_time,
          timezone: timeContext.timezone,
        })
      : null;

    scheduledMinutes = timing?.durationMinutes ?? null;
  }

  const overtimeMinutes =
    Number.isFinite(scheduledMinutes) && scheduledMinutes > 0
      ? Math.max(0, workedMinutes - scheduledMinutes)
      : 0;

  const { data: shift, error: shiftError } = await supabaseAdmin
    .from("staff_shifts")
    .update({
      clock_out: now.toISOString(),
      worked_minutes: workedMinutes,
      overtime_minutes: overtimeMinutes,
      shift_status: "COMPLETED",
    })
    .eq("id", openShift.id)
    .eq("organization_id", organizationId)
    .eq("staff_id", staff.id)
    .select("*")
    .single();

  if (shiftError) throw shiftError;

  const { data: attendance, error: attendanceError } = await supabaseAdmin
    .from("staff_attendance")
    .update({
      actual_end: now.toISOString(),
    })
    .eq("organization_id", organizationId)
    .eq("staff_id", staff.id)
    .eq("shift_id", openShift.id)
    .select("*")
    .maybeSingle();

  if (attendanceError) throw attendanceError;

  return {
    timezone: timeContext.timezone,
    shift,
    attendance: attendance || null,
  };
}

export default loadStaffWorkday;