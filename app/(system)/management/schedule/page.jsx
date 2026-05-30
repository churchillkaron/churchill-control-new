"use client";

import { useEffect, useState } from "react";

import {
  useTenant,
} from "@/app/providers/TenantProvider";
import { supabase } from "@/lib/supabase";

const DAYS = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
];

export default function ManagementSchedulePage() {

  const tenant =
    useTenant();

  const tenantId =
    tenant?.id;

  const [staff, setStaff] =
    useState([]);

  const [schedules, setSchedules] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [selectedMonth, setSelectedMonth] =
    useState(new Date().getMonth());

  const [selectedYear, setSelectedYear] =
    useState(new Date().getFullYear());

  useEffect(() => {

    loadData();

  }, [tenantId]);

  async function loadData() {

    if (!tenantId) {
      return;
    }

    setLoading(true);

    const { data: staffData } =
      await supabase
        .from("staff_accounts")
        .select("*")
        .eq(
          "tenant_id",
          tenantId
        )
        .eq("active", true);

    const { data: scheduleData } =
      await supabase
        .from("staff_schedules")
        .select("*")
        .eq(
          "tenant_id",
          tenantId
        );

    setStaff(staffData || []);
    setSchedules(scheduleData || []);

    setLoading(false);

  }

  function getDaysInMonth(month, year) {

    return new Date(
      year,
      month + 1,
      0
    ).getDate();

  }

  function getShift(staffId, day) {

    const date =
      `${selectedYear}-${String(
        selectedMonth + 1
      ).padStart(2, "0")}-${String(
        day
      ).padStart(2, "0")}`;

    return schedules.find(
      (s) =>
        s.staff_id === staffId &&
        s.shift_date === date
    );

  }

  async function removeShift(
    shiftId
  ) {

    await supabase
      .from("staff_schedules")
      .delete()
      .eq("id", shiftId);

    loadData();

  }

  async function assignShift(
    staffMember,
    day
  ) {

    const shiftDate =
      `${selectedYear}-${String(
        selectedMonth + 1
      ).padStart(2, "0")}-${String(
        day
      ).padStart(2, "0")}`;

    const existing =
      schedules.find(
        (s) =>
          s.staff_id ===
            staffMember.id &&
          s.shift_date ===
            shiftDate
      );

    if (existing) {

      const newStart =
        prompt(
          "Start time",
          existing.start_time
        );

      if (!newStart) return;

      const newEnd =
        prompt(
          "End time",
          existing.end_time
        );

      if (!newEnd) return;

      await supabase
        .from("staff_schedules")
        .update({
          start_time:
            newStart,
          end_time:
            newEnd,
        })
        .eq(
          "id",
          existing.id
        );

      loadData();

      return;

    }

    const startTime =
      prompt(
        "Start time",
        "17:00"
      );

    if (!startTime) return;

    const endTime =
      prompt(
        "End time",
        "02:00"
      );

    if (!endTime) return;

    await supabase
      .from("staff_schedules")
      .insert({

        tenant_id:
          tenantId,

        staff_id:
          staffMember.id,

        staff_name:
          staffMember.name ||
          staffMember.email,

        role:
          staffMember.role,

        department:
          staffMember.department,

        shift_date:
          shiftDate,

        start_time:
          startTime,

        end_time:
          endTime,

        shift_type:
          "Custom Shift",

        color:
          "#3b82f6",

      });

    loadData();

  }

  return (

    <div className="min-h-screen bg-black text-white p-6">

      <div className="mb-8 flex items-center justify-between">

        <div>

          <h1 className="text-5xl font-black">
            Schedule Runtime
          </h1>

          <p className="mt-2 text-zinc-500">
            Workforce planning and shift management
          </p>

        </div>

      </div>

      <div className="relative overflow-auto rounded-3xl border border-zinc-800 bg-zinc-950">

        <table className="relative z-0 w-full min-w-[2200px]">

          <thead>

            <tr className="border-b border-zinc-800">

              <th className="sticky left-0 z-20 bg-zinc-950 p-4 text-left pointer-events-none">
                Staff
              </th>

              {Array.from({
                length:
                  getDaysInMonth(
                    selectedMonth,
                    selectedYear
                  ),
              }).map((_, i) => (

                <th
                  key={i}
                  className="p-3 text-center text-sm text-zinc-500"
                >

                  <div>
                    {i + 1}
                  </div>

                  <div className="text-xs">
                    {
                      DAYS[
                        new Date(
                          selectedYear,
                          selectedMonth,
                          i + 1
                        ).getDay()
                      ]
                    }
                  </div>

                </th>

              ))}

            </tr>

          </thead>

          <tbody>

            {staff.map((member) => (

              <tr
                key={member.id}
                className="border-b border-zinc-900"
              >

                <td className="sticky left-0 z-10 min-w-[240px] border-r border-zinc-900 bg-zinc-950 p-4 pointer-events-none">

                  <div className="font-bold">
                    {member.name ||
                      member.email}
                  </div>

                  <div className="text-xs text-zinc-500">
                    {member.position}
                  </div>

                </td>

                {Array.from({
                  length:
                    getDaysInMonth(
                      selectedMonth,
                      selectedYear
                    ),
                }).map((_, i) => {

                  const shift =
                    getShift(
                      member.id,
                      i + 1
                    );

                  return (

                    <td
                      key={i}
                      onClick={() =>
                        assignShift(
                          member,
                          i + 1
                        )
                      }
                      onContextMenu={(e) => {

                        e.preventDefault();

                        if (
                          shift
                        ) {

                          removeShift(
                            shift.id
                          );

                        }

                      }}
                      className="relative z-50 h-24 cursor-pointer border border-zinc-900 transition-all hover:bg-zinc-900 pointer-events-auto"
                    >

                      {shift ? (

                        <div
                          className="pointer-events-none flex h-full flex-col justify-between rounded-2xl p-2 text-xs"
                          style={{
                            background:
                              shift.color,
                          }}
                        >

                          <div className="font-bold">
                            {
                              shift.shift_type
                            }
                          </div>

                          <div>
                            {
                              shift.start_time
                            }
                            {" - "}
                            {
                              shift.end_time
                            }
                          </div>

                        </div>

                      ) : (

                        <div className="pointer-events-none flex h-full items-center justify-center text-2xl opacity-10">
                          +
                        </div>

                      )}

                    </td>

                  );

                })}

              </tr>

            ))}

          </tbody>

        </table>

      </div>

      {loading && (

        <div className="mt-6 text-zinc-500">
          Loading...
        </div>

      )}

    </div>

  );

}
