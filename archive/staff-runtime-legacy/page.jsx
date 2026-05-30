"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/shared/supabase/client";

import StaffHeader from "@/components/staff/StaffHeader";
import StaffShiftCard from "@/components/staff/StaffShiftCard";
import StaffLeaderboard from "@/components/staff/StaffLeaderboard";
import StaffTimeline from "@/components/staff/StaffTimeline";
import StaffAI from "@/components/staff/StaffAI";
import StaffAIFeed from "@/components/staff/StaffAIFeed";

import {
  useTenant,
} from "@/app/providers/TenantProvider";

export default function StaffPage() {

  const tenant =
    useTenant();

  const tenantId =
    tenant?.id;

  const [staffAccount, setStaffAccount] =
    useState(null);

  const [runtime, setRuntime] =
    useState({
      staffWithPayout: [],
    });

  const [runtimeData, setRuntimeData] =
    useState({});

  const [shiftActive, setShiftActive] =
    useState(false);

  const [shiftLoading, setShiftLoading] =
    useState(false);

  const [shiftDuration, setShiftDuration] =
    useState("00:00");

  const [todaySchedule, setTodaySchedule] =
    useState(null);

  const [shiftStatus, setShiftStatus] =
    useState("NO_SHIFT");

  const [input, setInput] =
    useState("");

  const [loadingAI, setLoadingAI] =
    useState(false);

  const [lastAnswer, setLastAnswer] =
    useState("");

  useEffect(() => {

    async function bootstrap() {

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user?.email || !tenantId) {
        return;
      }

      const { data: account } =
        await supabase
          .from("staff_accounts")
          .select("*")
          .eq("email", session.user.email)
          .maybeSingle();

      const activeAccount =
        account || {
          name: "Patric",
          role: "OWNER",
          tenant_id:
            tenantId,
          email:
            session.user.email,
        };

      setStaffAccount(activeAccount);

      const today =
        new Date()
          .toISOString()
          .split("T")[0];

      const {
        data: schedule,
      } = await supabase
        .from("staff_schedules")
        .select("*")
        .eq(
          "staff_name",
          activeAccount.name
        )
        .eq(
          "shift_date",
          today
        )
        .maybeSingle();

      setTodaySchedule(
        schedule || null
      );

      fetch(
        `/api/staff/runtime?tenant_id=${activeAccount.tenant_id}&email=${activeAccount.email}`
      )
      .then(res => res.json())
      .then(runtimePayload => {

        console.log(
          "RUNTIME_PAYLOAD",
          runtimePayload
        );

        setRuntime({

          ...runtimePayload.runtime,

          staffWithPayout:
            (runtimePayload.performance || []).map(
              (member) => ({

                name:
                  member.name,

                role:
                  "STAFF",

                payrollAmount:
                  member.revenue || 0,

                score:
                  member.orders || 0,

                shift:
                  member.shift || null,

              })
            ),

        });

        setRuntimeData({

          notifications:
            runtimePayload.socialFeed || [],

          recommendations: [
            runtimePayload.aiInsight ||
            "Venue runtime stable"
          ],

          actions: [
            `${runtimePayload.runtime?.nightlifePhase || "Warmup"} mode active`,
            `${runtimePayload.runtime?.pressureLevel || "Controlled"} pressure`,
          ],

        });

      })
      .catch(console.error);

      const { data: activeShift } =
        await supabase
          .from("staff_shifts")
          .select("*")
          .eq("staff_name", activeAccount.name)
          .is("clock_out", null)
          .maybeSingle();

      if (activeShift) {

        setShiftActive(true);

        setShiftStatus(
          "WORKING"
        );

        function updateDuration() {

          const start =
            new Date(
              activeShift.clock_in
            ).getTime();

          const now =
            Date.now();

          const diff =
            Math.floor(
              (now - start) / 1000
            );

          const hours =
            String(
              Math.floor(diff / 3600)
            ).padStart(2, "0");

          const minutes =
            String(
              Math.floor(
                (diff % 3600) / 60
              )
            ).padStart(2, "0");

          setShiftDuration(
            `${hours}:${minutes}`
          );

        }

        updateDuration();

        setInterval(
          updateDuration,
          60000
        );

      } else if (schedule) {

        const now =
          new Date();

        const shiftStart =
          new Date(
            `${today}T${schedule.start_time}`
          );

        if (now > shiftStart) {

          setShiftStatus(
            "LATE"
          );

        } else {

          setShiftStatus(
            "UPCOMING"
          );

        }

      }

    }

    bootstrap();

  }, [tenantId]);

  async function startShift() {

    if (!staffAccount) return;

    setShiftLoading(true);

    try {

      const response =
        await fetch(
          "/api/staff",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({

              action:
                "clock_in",

              staffName:
                staffAccount.name,

              staffRole:
                staffAccount.role,

            }),
          }
        );

      const data =
        await response.json();

      if (
        data.success
      ) {

        setShiftActive(true);

        setShiftStatus(
          "WORKING"
        );

      }

    } catch (err) {

      console.error(err);

    }

    setShiftLoading(false);

  }

  async function endShift() {

    if (!staffAccount) return;

    setShiftLoading(true);

    try {

      const response =
        await fetch(
          "/api/staff",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({

              action:
                "clock_out",

              staffName:
                staffAccount.name,

            }),
          }
        );

      const data =
        await response.json();

      if (
        data.success
      ) {

        setShiftActive(false);

        setShiftDuration(
          "00:00"
        );

        setShiftStatus(
          "OFF"
        );

      }

    } catch (err) {

      console.error(err);

    }

    setShiftLoading(false);

  }

  async function askAI() {

    if (!input) return;

    setLoadingAI(true);

    try {

      const response =
        await fetch(
          "/api/staff/ai-feed",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              input,
            }),
          }
        );

      const data =
        await response.json();

      setLastAnswer(
        data?.response ||
        data?.message ||
        "Operational intelligence online"
      );

    } catch (err) {

      console.error(err);

    }

    setLoadingAI(false);

  }

  const runtimeGlow =
    runtime?.pressureLevel === "High"
      ? "bg-red-500/10"
      : runtime?.nightlifePhase === "Peak"
      ? "bg-fuchsia-500/10"
      : runtime?.nightlifePhase === "Closing"
      ? "bg-orange-500/10"
      : "bg-cyan-500/10";

  const runtimeSecondaryGlow =
    runtime?.shiftEnergy === "Explosive"
      ? "bg-emerald-500/10"
      : "bg-cyan-500/10";

  return (

    <div className="relative min-h-screen overflow-hidden bg-black text-white">

      <div className="pointer-events-none absolute inset-0">

        <div
          className={`absolute left-[-10%] top-[5%] h-[500px] w-[500px] rounded-full blur-[140px] transition-all duration-1000 ${runtimeGlow}`}
        />

        <div
          className={`absolute right-[-10%] top-[20%] h-[450px] w-[450px] rounded-full blur-[140px] transition-all duration-1000 ${runtimeSecondaryGlow}`}
        />

        <div
          className="absolute bottom-[-10%] left-[20%] h-[500px] w-[500px] rounded-full bg-emerald-500/10 blur-[160px]"
        />

        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.015),transparent)]" />

      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-4 py-6">

        <StaffHeader
          staffAccount={staffAccount}
          shiftActive={shiftActive}
          shiftDuration={shiftDuration}
          runtime={runtime}
          shiftStatus={shiftStatus}
        />

        
<div className="mb-6 overflow-hidden rounded-[32px] border border-white/10 bg-black/40 backdrop-blur-3xl">

  <div className="border-b border-white/5 px-5 py-4">

    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">

      <div>

        <div className="text-[11px] uppercase tracking-[0.35em] text-cyan-300">
          Live Venue Runtime
        </div>

        <div className="mt-2 text-2xl font-black text-white">
          Operational Pulse Network
        </div>

      </div>

      <div className="flex items-center gap-2">

        <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />

        <div className="text-xs uppercase tracking-[0.3em] text-emerald-300">
          LIVE
        </div>

      </div>

    </div>

  </div>

  <div className="grid gap-px bg-white/5 md:grid-cols-5">

    <div className="bg-black/40 p-5">

      <div className="text-[10px] uppercase tracking-[0.3em] text-fuchsia-300">
        Venue Mood
      </div>

      <div className="mt-3 text-lg font-black text-white">
        {runtime?.venueMood || "Stable"}
      </div>

      <div className="mt-2 text-xs text-white/40">
        Hospitality atmosphere runtime
      </div>

    </div>

    <div className="bg-black/40 p-5">

      <div className="text-[10px] uppercase tracking-[0.3em] text-orange-300">
        Pressure Level
      </div>

      <div className="mt-3 text-lg font-black text-white">
        {runtime?.pressureLevel || "Controlled"}
      </div>

      <div className="mt-2 text-xs text-white/40">
        Operational load balancing
      </div>

    </div>

    <div className="bg-black/40 p-5">

      <div className="text-[10px] uppercase tracking-[0.3em] text-emerald-300">
        Shift Energy
      </div>

      <div className="mt-3 text-lg font-black text-white">
        {runtime?.shiftEnergy || "Stable"}
      </div>

      <div className="mt-2 text-xs text-white/40">
        Team momentum analysis
      </div>

    </div>

    <div className="bg-black/40 p-5">

      <div className="text-[10px] uppercase tracking-[0.3em] text-cyan-300">
        Runtime Confidence
      </div>

      <div className="mt-3 text-lg font-black text-white">
        {runtime?.aiConfidence || "Stable"}
      </div>

      <div className="mt-2 text-xs text-white/40">
        AI operational certainty
      </div>

    </div>

    <div className="bg-black/40 p-5">

      <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">
        Revenue Tonight
      </div>

      <div className="mt-3 text-lg font-black text-white">
        ฿{runtime?.revenueToday || 0}
      </div>

      <div className="mt-2 text-xs text-white/40">
        Live hospitality revenue
      </div>

    </div>

  </div>

</div>


          <div className="rounded-[24px] border border-cyan-500/20 bg-cyan-500/10 p-4 backdrop-blur-3xl">
            <div className="text-[10px] uppercase tracking-[0.3em] text-cyan-300">
              Pressure
            </div>
            <div className="mt-3 text-lg font-black text-white">
              {runtime?.pressureLevel || "Controlled"}
            </div>
          </div>

          <div className="rounded-[24px] border border-emerald-500/20 bg-emerald-500/10 p-4 backdrop-blur-3xl">
            <div className="text-[10px] uppercase tracking-[0.3em] text-emerald-300">
              Shift Energy
            </div>
            <div className="mt-3 text-lg font-black text-white">
              {runtime?.shiftEnergy || "Stable"}
            </div>
          </div>

          <div className="rounded-[24px] border border-orange-500/20 bg-orange-500/10 p-4 backdrop-blur-3xl">
            <div className="text-[10px] uppercase tracking-[0.3em] text-orange-300">
              Nightlife Phase
            </div>
            <div className="mt-3 text-lg font-black text-white">
              {runtime?.nightlifePhase || "Warmup"}
            </div>
          </div>

          <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4 backdrop-blur-3xl">
            <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">
              Revenue Tonight
            </div>
            <div className="mt-3 text-lg font-black text-white">
              ฿{runtime?.revenueToday || 0}
            </div>
          </div>

        </div>

        <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">

          <div>

            {todaySchedule && (

              <div className="mb-6 rounded-[32px] border border-cyan-500/20 bg-cyan-500/10 p-6 backdrop-blur-3xl">

                <div className="text-[11px] uppercase tracking-[0.3em] text-cyan-300">
                  Tonight Schedule
                </div>

                <div className="mt-3 text-4xl font-black text-white">

                  {todaySchedule.start_time}
                  {" - "}
                  {todaySchedule.end_time}

                </div>

                <div className="mt-2 text-sm uppercase tracking-[0.2em] text-white/50">
                  {todaySchedule.shift_type}
                </div>

                <div className="mt-5 inline-flex rounded-2xl border border-white/10 bg-black/20 px-4 py-2 text-sm font-bold">
                  STATUS:
                  {" "}
                  {shiftStatus}
                </div>

              </div>

            )}

            <StaffShiftCard
              shiftActive={shiftActive}
              shiftLoading={shiftLoading}
              shiftDuration={shiftDuration}
              startShift={startShift}
              endShift={endShift}
            />

            <StaffTimeline
              runtime={runtime}
            />

          </div>

          <div>

            <StaffAIFeed
              runtimeData={runtimeData}
            />

            <StaffLeaderboard
              runtime={runtime}
            />

          </div>

        </div>

        <StaffAI
          input={input}
          setInput={setInput}
          askAI={askAI}
          loadingAI={loadingAI}
          lastAnswer={lastAnswer}
        />

      </div>

    

  );

}
