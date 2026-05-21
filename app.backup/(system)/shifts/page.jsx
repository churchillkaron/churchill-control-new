"use client";

export const dynamic = "force-dynamic";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Clock3,
  Users,
  CheckCircle2,
  AlertTriangle,
  CalendarDays,
  Timer,
} from "lucide-react";

import PageWrapper from "@/components/PageWrapper";

import {
  loadStaff,
  getTenantId,
  createRealtimeChannel,
} from "@/lib/shared/loaders/loadOperationalData";

export default function ShiftsPage() {

  const [tenantId, setTenantId] =
    useState(null);

  const [staff, setStaff] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  // ====================================
  // LOAD
  // ====================================

  async function loadShifts(
    activeTenantId
  ) {

    const staffData =
      await loadStaff(
        activeTenantId
      );

    setStaff(
      staffData
    );

    setLoading(false);
  }

  // ====================================
  // BOOT
  // ====================================

  useEffect(() => {

    async function boot() {

      const currentTenant =
        await getTenantId();

      if (!currentTenant) {
        setLoading(false);
        return;
      }

      setTenantId(
        currentTenant
      );

      await loadShifts(
        currentTenant
      );

      const realtime =
        createRealtimeChannel({

          name:
            "shifts-live",

          tables: [
            "staff_accounts",
          ],

          callback: () =>
            loadShifts(
              currentTenant
            ),

        });

      return () => realtime;

    }

    boot();

  }, []);

  // ====================================
  // KPI
  // ====================================

  const metrics =
    useMemo(() => {

      const active =
        staff.filter(
          member =>

            member.status !==
            "INACTIVE"
        ).length;

      const late =
        staff.filter(
          member =>

            member.shift_status ===
            "LATE"
        ).length;

      const checkedIn =
        staff.filter(
          member =>

            member.shift_status ===
            "CHECKED_IN"
        ).length;

      return {

        active,

        late,

        checkedIn,
      };

    }, [staff]);

  return (

    <PageWrapper
      title="Shifts"
      subtitle="Enterprise shift operations"
    >

      {loading ? (

        <div className="text-white/40">
          Loading shifts...
        </div>

      ) : (

        <div className="space-y-6">

          {/* KPI */}
          <div className="grid grid-cols-4 gap-5">

            <div className="rounded-[28px] border border-violet-500/20 bg-violet-500/10 p-6">

              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-violet-300 mb-4">

                <Users className="w-4 h-4" />

                Staff

              </div>

              <div className="text-4xl font-light text-violet-400">
                {
                  metrics.active
                }
              </div>

            </div>

            <div className="rounded-[28px] border border-emerald-500/20 bg-emerald-500/10 p-6">

              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-emerald-300 mb-4">

                <CheckCircle2 className="w-4 h-4" />

                Checked In

              </div>

              <div className="text-4xl font-light text-emerald-400">
                {
                  metrics.checkedIn
                }
              </div>

            </div>

            <div className="rounded-[28px] border border-red-500/20 bg-red-500/10 p-6">

              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-red-300 mb-4">

                <AlertTriangle className="w-4 h-4" />

                Late

              </div>

              <div className="text-4xl font-light text-red-400">
                {
                  metrics.late
                }
              </div>

            </div>

            <div className="rounded-[28px] border border-cyan-500/20 bg-cyan-500/10 p-6">

              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-cyan-300 mb-4">

                <CalendarDays className="w-4 h-4" />

                Active Shift

              </div>

              <div className="text-4xl font-light text-cyan-400">
                TODAY
              </div>

            </div>

          </div>

          {/* SHIFT TABLE */}
          <div className="rounded-[30px] border border-white/10 bg-white/[0.03] overflow-hidden">

            <div className="grid grid-cols-7 gap-4 px-6 py-5 border-b border-white/5 text-xs uppercase tracking-[0.2em] text-white/40">

              <div>Staff</div>
              <div>Role</div>
              <div>Shift</div>
              <div>Status</div>
              <div>Hours</div>
              <div>Attendance</div>
              <div>Operations</div>

            </div>

            <div className="divide-y divide-white/5">

              {staff.map(member => {

                const status =
                  member.shift_status ||
                  "OFFLINE";

                const late =
                  status === "LATE";

                const checkedIn =
                  status ===
                  "CHECKED_IN";

                return (

                  <div
                    key={member.id}
                    className="grid grid-cols-7 gap-4 px-6 py-5 items-center"
                  >

                    <div>

                      <div className="text-lg">
                        {
                          member.name
                        }
                      </div>

                      <div className="text-xs uppercase text-white/40 mt-1">
                        {
                          member.email
                        }
                      </div>

                    </div>

                    <div className="text-white/60">

                      {
                        member.role
                      }

                    </div>

                    <div className="text-white/60">

                      {
                        member.shift_name ||
                        "GENERAL"
                      }

                    </div>

                    <div>

                      {checkedIn ? (

                        <div className="inline-flex items-center gap-2 px-4 h-10 rounded-2xl bg-emerald-500 text-black text-xs uppercase tracking-[0.2em]">

                          <CheckCircle2 className="w-4 h-4" />

                          Checked In

                        </div>

                      ) : late ? (

                        <div className="inline-flex items-center gap-2 px-4 h-10 rounded-2xl bg-red-500 text-black text-xs uppercase tracking-[0.2em]">

                          <AlertTriangle className="w-4 h-4" />

                          Late

                        </div>

                      ) : (

                        <div className="inline-flex items-center gap-2 px-4 h-10 rounded-2xl bg-white/5 text-xs uppercase tracking-[0.2em]">

                          <Clock3 className="w-4 h-4" />

                          Offline

                        </div>

                      )}

                    </div>

                    <div className="text-lg">

                      {
                        member.hours_worked ||
                        0
                      }h

                    </div>

                    <div>

                      <div className="inline-flex items-center gap-2 px-4 h-10 rounded-2xl bg-violet-500 text-white text-xs uppercase tracking-[0.2em]">

                        <Timer className="w-4 h-4" />

                        ACTIVE

                      </div>

                    </div>

                    <div className="text-sm text-white/40">

                      LIVE

                    </div>

                  </div>

                );

              })}

            </div>

          </div>

        </div>

      )}

    </PageWrapper>

  );

}
