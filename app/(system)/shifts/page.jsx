"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/shared/supabase/client";

import PageWrapper from "@/components/PageWrapper";

import { calculateAttendanceScore } from "@/lib/staff/calculateAttendanceScore";

export default function ShiftsPage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null);

  const [
    currentUser,
    setCurrentUser,
  ] = useState(null);

  const [
    shifts,
    setShifts,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    processing,
    setProcessing,
  ] = useState(false);

  // ===== SCHEDULE =====
  const scheduledHour = 9;

  // ===== LOAD =====
  async function loadShifts() {

    if (!tenantId) {
      return;
    }

    const {
      data,
      error,
    } = await supabase
      .from("shift_logs")
      .select("*")
      .eq(
        "tenant_id",
        tenantId
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      );

    if (error) {

      console.error(
        error
      );

      return;
    }

    setShifts(
      data || []
    );

    setLoading(false);
  }

  // ===== INIT =====
  useEffect(() => {

    async function init() {

      const {
        data: { user },
      } =
        await supabase.auth.getUser();

      if (!user) {
        return;
      }

      setCurrentUser(user);

      const {
        data,
      } = await supabase
        .from(
          "staff_accounts"
        )
        .select("*")
        .eq(
          "auth_user_id",
          user.id
        )
        .single();

      if (!data) {
        return;
      }

      setTenantId(
        data.tenant_id
      );
    }

    init();

  }, []);

  // ===== LOAD =====
  useEffect(() => {

    if (!tenantId) {
      return;
    }

    loadShifts();

  }, [tenantId]);

  // ===== CLOCK IN =====
  async function clockIn() {

    try {

      setProcessing(true);

      const {
        data: staff,
      } = await supabase
        .from(
          "staff_accounts"
        )
        .select("*")
        .eq(
          "auth_user_id",
          currentUser.id
        )
        .single();

      const now =
        new Date();

      const scheduledStart =
        new Date();

      scheduledStart.setHours(
        scheduledHour,
        0,
        0,
        0
      );

      const lateMinutes =
        Math.max(
          0,
          Math.floor(
            (
              now.getTime() -
              scheduledStart.getTime()
            ) /
              1000 /
              60
          )
        );

      const attendanceScore =
        calculateAttendanceScore({
          lateMinutes,
          overtimeHours: 0,
        });

      await supabase
        .from("shift_logs")
        .insert({

          tenant_id:
            tenantId,

          staff_id:
            staff.id,

          staff_name:
            staff.name,

          role:
            staff.role,

          clock_in:
            now,

          scheduled_start:
            scheduledStart,

          late_minutes:
            lateMinutes,

          attendance_score:
            attendanceScore,

          status:
            "CLOCKED_IN",
        });

      await loadShifts();

    } catch (error) {

      console.error(
        error
      );

      alert(
        "Failed to clock in"
      );

    } finally {

      setProcessing(false);
    }
  }

  // ===== CLOCK OUT =====
  async function clockOut(
    shift
  ) {

    try {

      setProcessing(true);

      const now =
        new Date();

      const clockIn =
        new Date(
          shift.clock_in
        ).getTime();

      const clockOut =
        now.getTime();

      const totalHours =
        (
          (
            clockOut -
            clockIn
          ) /
          1000 /
          60 /
          60
        ).toFixed(2);

      const overtimeHours =
        Math.max(
          0,
          Number(
            totalHours
          ) - 8
        );

      const attendanceScore =
        calculateAttendanceScore({

          lateMinutes:
            shift.late_minutes,

          overtimeHours,
        });

      await supabase
        .from("shift_logs")
        .update({

          clock_out:
            now,

          total_hours:
            totalHours,

          overtime_hours:
            overtimeHours,

          attendance_score:
            attendanceScore,

          status:
            "CLOCKED_OUT",
        })
        .eq(
          "id",
          shift.id
        );

      await loadShifts();

    } catch (error) {

      console.error(
        error
      );

      alert(
        "Failed to clock out"
      );

    } finally {

      setProcessing(false);
    }
  }

  // ===== ACTIVE SHIFT =====
  const activeShift =
    shifts.find(
      (shift) =>
        shift.status ===
        "CLOCKED_IN"
    );

  return (
    <div className="min-h-screen bg-[#050507]">

      <PageWrapper
        title="Shifts"
        subtitle="Operational staff attendance"
      >

        {loading ? (

          <div className="text-white/40">
            Loading shifts...
          </div>

        ) : (

          <div className="space-y-6">

            {/* ACTION */}
            <div className="flex justify-end">

              {!activeShift ? (

                <button
                  onClick={
                    clockIn
                  }
                  disabled={
                    processing
                  }
                  className="rounded-[18px] bg-green-500 px-8 py-4 text-white transition hover:bg-green-400 disabled:opacity-40"
                >
                  CLOCK IN
                </button>

              ) : (

                <button
                  onClick={() =>
                    clockOut(
                      activeShift
                    )
                  }
                  disabled={
                    processing
                  }
                  className="rounded-[18px] bg-red-500 px-8 py-4 text-white transition hover:bg-red-400 disabled:opacity-40"
                >
                  CLOCK OUT
                </button>

              )}

            </div>

            {/* TABLE */}
            <div className="overflow-hidden rounded-[24px] border border-white/10 bg-[#111117]">

              <div className="grid grid-cols-8 border-b border-white/10 px-6 py-4 text-[11px] tracking-[0.25em] text-white/30">

                <div>
                  STAFF
                </div>

                <div>
                  ROLE
                </div>

                <div>
                  LATE
                </div>

                <div>
                  HOURS
                </div>

                <div>
                  OVERTIME
                </div>

                <div>
                  SCORE
                </div>

                <div>
                  STATUS
                </div>

                <div>
                  DATE
                </div>

              </div>

              <div className="divide-y divide-white/5">

                {shifts.map(
                  (shift) => (

                    <div
                      key={shift.id}
                      className="grid grid-cols-8 items-center px-6 py-5 transition hover:bg-white/[0.02]"
                    >

                      <div
                        className="text-lg"
                        style={{
                          fontWeight: 300,
                        }}
                      >
                        {
                          shift.staff_name
                        }
                      </div>

                      <div className="text-white/50">
                        {
                          shift.role
                        }
                      </div>

                      <div
                        className={`text-sm ${
                          Number(
                            shift.late_minutes
                          ) > 0
                            ? "text-red-400"
                            : "text-green-400"
                        }`}
                      >
                        {
                          shift.late_minutes
                        }m
                      </div>

                      <div
                        className="text-lg"
                        style={{
                          fontWeight: 250,
                        }}
                      >
                        {
                          shift.total_hours
                        }
                      </div>

                      <div className="text-blue-400">
                        {
                          shift.overtime_hours
                        }h
                      </div>

                      <div
                        className={`text-lg ${
                          Number(
                            shift.attendance_score
                          ) >= 90
                            ? "text-green-400"
                            : Number(
                                shift.attendance_score
                              ) >= 70
                            ? "text-yellow-400"
                            : "text-red-400"
                        }`}
                        style={{
                          fontWeight: 250,
                        }}
                      >
                        {
                          shift.attendance_score
                        }
                      </div>

                      <div>

                        <div
                          className={`inline-flex rounded-full px-3 py-1 text-[11px] tracking-[0.15em] ${
                            shift.status ===
                            "CLOCKED_IN"
                              ? "border border-green-500/20 bg-green-500/10 text-green-400"
                              : "border border-blue-500/20 bg-blue-500/10 text-blue-400"
                          }`}
                        >
                          {
                            shift.status
                          }
                        </div>

                      </div>

                      <div className="text-sm text-white/40">

                        {shift.created_at
                          ? new Date(
                              shift.created_at
                            ).toLocaleDateString()
                          : "-"}

                      </div>

                    </div>
                  )
                )}

              </div>

            </div>

          </div>

        )}

      </PageWrapper>

    </div>
  );
}
