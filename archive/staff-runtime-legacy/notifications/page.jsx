"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  Bell,
  AlertTriangle,
  Sparkles,
  Crown,
  Clock3,
} from "lucide-react";

export default function StaffNotificationsPage() {

  const [notifications, setNotifications] =
    useState([]);

  useEffect(() => {

    loadNotifications();

  }, []);

  async function loadNotifications() {

    try {

      const res =
        await fetch(
          "/api/staff/ai-runtime",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              role: "STAFF",
              question:
                "Generate live operational notifications.",
            }),
          }
        );

      const data =
        await res.json();

      setNotifications(
        data.notifications ||
        data.realtimeFeed ||
        []
      );

    } catch (err) {

      console.error(err);

    }

  }

  function getIcon(type) {

    if (
      type?.includes("VIP")
    ) {

      return Crown;

    }

    if (
      type?.includes("RUNTIME")
    ) {

      return AlertTriangle;

    }

    if (
      type?.includes("REVENUE")
    ) {

      return Sparkles;

    }

    return Clock3;

  }

  return (

    <div className="min-h-screen bg-black px-5 py-10 text-white">

      <div className="mx-auto max-w-6xl">

        <div className="mb-10">

          <div className="text-[11px] uppercase tracking-[0.35em] text-amber-300">
            Churchill Runtime
          </div>

          <div className="mt-3 flex items-center gap-3 text-5xl font-black">

            <Bell className="h-10 w-10 text-amber-300" />

            Notifications

          </div>

          <div className="mt-3 text-white/40">
            Live operational alerts, AI recommendations and runtime movement.
          </div>

        </div>

        <div className="space-y-5">

          {notifications.map(
            (
              item,
              index
            ) => {

              const Icon =
                getIcon(
                  item.type || ""
                );

              return (

                <div
                  key={index}
                  className="rounded-[34px] border border-white/10 bg-white/[0.04] p-6"
                >

                  <div className="flex items-center justify-between">

                    <div className="flex items-center gap-5">

                      <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-black/40">

                        <Icon className="h-8 w-8 text-amber-300" />

                      </div>

                      <div>

                        <div className="text-2xl font-black">
                          {item.title ||
                            "Operational Alert"}
                        </div>

                        <div className="mt-2 text-white/40">
                          {item.message ||
                            item.type}
                        </div>

                      </div>

                    </div>

                  </div>

                </div>

              );

            }
          )}

        </div>

      </div>

    </div>

  );

}
