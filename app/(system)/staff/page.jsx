"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/shared/supabase/client";

import StaffHeader from "@/components/staff/StaffHeader";
import StaffShiftCard from "@/components/staff/StaffShiftCard";
import StaffLeaderboard from "@/components/staff/StaffLeaderboard";
import StaffTimeline from "@/components/staff/StaffTimeline";
import StaffAI from "@/components/staff/StaffAI";
import StaffAIFeed from "@/components/staff/StaffAIFeed";

export default function StaffPage() {

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

      if (!session?.user?.email) {
        return;
      }

      const { data: account } =
        await supabase
          .from("staff_accounts")
          .select("*")
          .eq("email", session.user.email)
          .maybeSingle();

      if (!account) {

        setStaffAccount({
          name: "Patric",
          role: "OWNER",
          tenant_id:
            "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4",
        });

      } else {

        setStaffAccount(account);

      }

      const activeAccount =
        account || {
          name: "Patric",
          role: "OWNER",
          tenant_id:
            "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4",
        };

      fetch(
        `/api/staff/runtime?tenant_id=${activeAccount.tenant_id}&staff_name=${activeAccount.name}`
      )
      .then(res => res.json())
      .then(runtimePayload => {

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

              })
            ),

        });

      })
      .catch(console.error);

      setRuntimeData({
        notifications: [
          "AI Runtime Connected"
        ],
        recommendations: [
          "Operational systems online"
        ],
        actions: [
          "Awaiting live venue activity"
        ],
      });

      const { data: activeShift } =
        await supabase
          .from("staff_shifts")
          .select("*")
          .eq("staff_name", activeAccount.name)
          .is("clock_out", null)
          .maybeSingle();

      if (activeShift) {

        setShiftActive(true);

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

      }

    }

    bootstrap();

  }, []);

  async function startShift() {

    if (!staffAccount) return;

    setShiftLoading(true);

    try {

      await supabase
        .from("staff_shifts")
        .insert({
          staff_name:
            staffAccount.name,

          clock_in:
            new Date().toISOString(),
        });

      setShiftActive(true);

    } catch (err) {

      console.error(err);

    }

    setShiftLoading(false);

  }

  async function endShift() {

    if (!staffAccount) return;

    setShiftLoading(true);

    try {

      await supabase
        .from("staff_shifts")
        .update({
          clock_out:
            new Date().toISOString(),
        })
        .eq(
          "staff_name",
          staffAccount.name
        )
        .is(
          "clock_out",
          null
        );

      setShiftActive(false);

      setShiftDuration(
        "00:00"
      );

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
          "/api/staff/ai-runtime",
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
        "AI Runtime Online"
      );

    } catch (err) {

      console.error(err);

    }

    setLoadingAI(false);

  }

  return (

    <div className="min-h-screen bg-black text-white">

      <div className="mx-auto max-w-7xl px-4 py-6">

        <StaffHeader
          staffAccount={staffAccount}
          shiftActive={shiftActive}
          shiftDuration={shiftDuration}
        />

        <StaffShiftCard
          shiftActive={shiftActive}
          shiftLoading={shiftLoading}
          shiftDuration={shiftDuration}
          startShift={startShift}
          endShift={endShift}
        />

        <StaffLeaderboard
          runtime={runtime}
        />

        <StaffTimeline
          runtime={runtime}
        />

        <StaffAIFeed
          runtimeData={runtimeData}
        />

        <StaffAI
          input={input}
          setInput={setInput}
          askAI={askAI}
          loadingAI={loadingAI}
          lastAnswer={lastAnswer}
        />

      </div>

    </div>

  );

}
