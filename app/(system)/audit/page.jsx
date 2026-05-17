"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/shared/supabase/client";

import PageWrapper from "@/components/PageWrapper";

export default function AuditPage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null);

  const [
    logs,
    setLogs,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  // ===== LOAD =====
  async function loadAuditLogs() {

    if (!tenantId) {
      return;
    }

    const {
      data,
      error,
    } = await supabase
      .from("audit_logs")
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
      )
      .limit(100);

    if (error) {

      console.error(
        error
      );

      return;
    }

    setLogs(
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

      const {
        data,
      } = await supabase
        .from(
          "staff_accounts"
        )
        .select(
          "tenant_id"
        )
        .eq(
          "auth_user_id",
          user.id
        )
        .single();

      if (
        !data?.tenant_id
      ) {
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

    loadAuditLogs();

  }, [tenantId]);

  return (
    <div className="min-h-screen bg-[#050507]">

      <PageWrapper
        title="Audit Logs"
        subtitle="Operational system activity tracking"
      >

        {loading ? (

          <div className="text-white/40">
            Loading audit logs...
          </div>

        ) : (

          <div className="space-y-6">

            {/* METRICS */}
            <div className="grid grid-cols-3 gap-4">

              <div className="rounded-[24px] border border-[#8B5CF6]/20 bg-[#8B5CF6]/10 p-6">

                <div className="text-[11px] tracking-[0.25em] text-[#C4B5FD]/60">
                  TOTAL LOGS
                </div>

                <div
                  className="mt-4 text-5xl text-[#B58AF8]"
                  style={{
                    fontWeight: 250,
                    letterSpacing: "-0.08em",
                  }}
                >
                  {
                    logs.length
                  }
                </div>

              </div>

              <div className="rounded-[24px] border border-green-500/20 bg-green-500/10 p-6">

                <div className="text-[11px] tracking-[0.25em] text-green-300/60">
                  SYSTEM STATUS
                </div>

                <div
                  className="mt-5 text-xl text-green-400"
                  style={{
                    fontWeight: 300,
                  }}
                >
                  TRACKING ACTIVE
                </div>

              </div>

              <div className="rounded-[24px] border border-blue-500/20 bg-blue-500/10 p-6">

                <div className="text-[11px] tracking-[0.25em] text-blue-300/60">
                  REALTIME
                </div>

                <div
                  className="mt-5 text-xl text-blue-400"
                  style={{
                    fontWeight: 300,
                  }}
                >
                  ENABLED
                </div>

              </div>

            </div>

            {/* TABLE */}
            <div className="overflow-hidden rounded-[24px] border border-white/10 bg-[#111117]">

              <div className="grid grid-cols-6 border-b border-white/10 px-6 py-4 text-[11px] tracking-[0.25em] text-white/30">

                <div>
                  ACTION
                </div>

                <div>
                  ENTITY
                </div>

                <div>
                  USER
                </div>

                <div>
                  ENTITY ID
                </div>

                <div>
                  DATE
                </div>

                <div>
                  METADATA
                </div>

              </div>

              <div className="divide-y divide-white/5">

                {logs.map(
                  (log) => (

                    <div
                      key={log.id}
                      className="grid grid-cols-6 items-center px-6 py-5 transition hover:bg-white/[0.02]"
                    >

                      <div>

                        <div className="inline-flex rounded-full border border-[#8B5CF6]/20 bg-[#8B5CF6]/10 px-3 py-1 text-[11px] tracking-[0.15em] text-[#B58AF8]">
                          {
                            log.action_type
                          }
                        </div>

                      </div>

                      <div className="text-white/60">
                        {
                          log.entity_type
                        }
                      </div>

                      <div
                        className="text-lg"
                        style={{
                          fontWeight: 300,
                        }}
                      >
                        {
                          log.performed_by_name
                        }
                      </div>

                      <div className="truncate text-xs text-white/30">
                        {
                          log.entity_id
                        }
                      </div>

                      <div className="text-sm text-white/40">

                        {log.created_at
                          ? new Date(
                              log.created_at
                            ).toLocaleString()
                          : "-"}

                      </div>

                      <div className="truncate text-xs text-white/30">
                        {log.metadata
                          ? JSON.stringify(
                              log.metadata
                            )
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
