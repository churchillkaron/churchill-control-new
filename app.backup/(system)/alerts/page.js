"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/shared/supabase/client";

export default function AlertsPage() {

  const [alerts, setAlerts] =
    useState([]);

  const [tenantId, setTenantId] =
    useState(null);

  // =========================
  // LOAD TENANT
  // =========================

  useEffect(() => {

    loadTenant();

  }, []);

  const loadTenant =
    async () => {

      const {
        data: { user },
      } =
        await supabase.auth.getUser();

      if (!user) return;

      const {
        data,
        error,
      } = await supabase
        .from("staff_accounts")
        .select(`
          tenant_id
        `)
        .eq(
          "auth_user_id",
          user.id
        )
        .single();

      if (
        error ||
        !data?.tenant_id
      ) {

        console.error(
          error
        );

        return;

      }

      setTenantId(
        data.tenant_id
      );

    };

  // =========================
  // LOAD ALERTS
  // =========================

  useEffect(() => {

    if (!tenantId) return;

    loadAlerts();

    const interval =
      setInterval(
        loadAlerts,
        5000
      );

    return () =>
      clearInterval(
        interval
      );

  }, [tenantId]);

  const loadAlerts =
    async () => {

      const {
        data,
        error,
      } = await supabase
        .from("system_alerts")
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

      setAlerts(
        data || []
      );

    };

  // =========================
  // RESOLVE ALERT
  // =========================

  const resolveAlert =
    async (id) => {

      const {
        error,
      } = await supabase
        .from(
          "system_alerts"
        )
        .update({

          status:
            "RESOLVED",

          resolved_at:
            new Date().toISOString(),

        })
        .eq("id", id);

      if (error) {

        console.error(
          error
        );

        return;

      }

      loadAlerts();

    };

  return (

    <div className="space-y-10 text-white p-6">

      <h1 className="text-3xl">

        Alert Center

      </h1>

      <div className="space-y-6">

        {alerts.length === 0 && (

          <div className="text-white/40">

            No alerts

          </div>

        )}

        {alerts.map(
          (alert) => {

            const severity =
              (
                alert.severity ||
                "INFO"
              ).toUpperCase();

            let border =
              "border-blue-500/30";

            let bg =
              "bg-blue-500/10";

            let text =
              "text-blue-400";

            if (
              severity ===
              "WARNING"
            ) {

              border =
                "border-yellow-500/30";

              bg =
                "bg-yellow-500/10";

              text =
                "text-yellow-400";

            }

            if (
              severity ===
              "CRITICAL"
            ) {

              border =
                "border-red-500/30";

              bg =
                "bg-red-500/10";

              text =
                "text-red-400";

            }

            const resolved =
              alert.status ===
              "RESOLVED";

            return (

              <div
                key={alert.id}
                className={`

                  border
                  rounded-2xl
                  p-6
                  ${border}
                  ${bg}
                  ${
                    resolved
                      ? "opacity-50"
                      : ""
                  }

                `}
              >

                <div className="flex justify-between items-start gap-4">

                  <div className="space-y-2 flex-1">

                    <div className="flex items-center gap-3">

                      <div
                        className={`text-xs uppercase tracking-[0.15em] ${text}`}
                      >

                        {severity}

                      </div>

                      <div className="text-xs text-white/40">

                        {alert.alert_type}

                      </div>

                    </div>

                    <div className="text-xl">

                      {alert.title}

                    </div>

                    <div className="text-white/70">

                      {alert.message}

                    </div>

                    <div className="text-xs text-white/40">

                      {new Date(
                        alert.created_at
                      ).toLocaleString()}

                    </div>

                  </div>

                  {!resolved && (

                    <button
                      onClick={() =>
                        resolveAlert(
                          alert.id
                        )
                      }
                      className="
                        px-4
                        py-2
                        rounded-xl
                        bg-green-500
                        text-black
                        text-sm
                        font-semibold
                      "
                    >

                      Resolve

                    </button>

                  )}

                </div>

              </div>

            );

          }
        )}

      </div>

    </div>

  );

}
