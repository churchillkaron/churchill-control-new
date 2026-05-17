"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/shared/supabase/client";

import PageWrapper from "@/components/PageWrapper";

export default function StaffPage() {

  const [
    tenantId,
    setTenantId,
  ] = useState(null);

  const [
    staff,
    setStaff,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  // ===== LOAD =====
  async function loadStaff() {

    if (!tenantId) {
      return;
    }

    const {
      data,
      error,
    } = await supabase
      .from(
        "staff_accounts"
      )
      .select("*")
      .eq(
        "tenant_id",
        tenantId
      )
      .order(
        "name",
        {
          ascending: true,
        }
      );

    if (error) {

      console.error(
        error
      );

      return;
    }

    setStaff(
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

    loadStaff();

  }, [tenantId]);

  // ===== REALTIME =====
  useEffect(() => {

    if (!tenantId) {
      return;
    }

    const channel =
      supabase
        .channel(
          "staff-live"
        )

        .on(
          "postgres_changes",
          {
            event: "*",
            schema:
              "public",
            table:
              "staff_accounts",
            filter: `tenant_id=eq.${tenantId}`,
          },
          () =>
            loadStaff()
        )

        .subscribe();

    return () => {
      supabase.removeChannel(
        channel
      );
    };

  }, [tenantId]);

  return (
    <div className="min-h-screen bg-[#050507]">

      <PageWrapper
        title="Staff"
        subtitle="Operational team overview"
      >

        {loading ? (

          <div className="text-white/40">
            Loading staff...
          </div>

        ) : (

          <div className="space-y-6">

            {/* METRICS */}
            <div className="grid grid-cols-3 gap-4">

              <div className="rounded-[24px] border border-white/10 bg-[#111117] p-6">

                <div className="text-[11px] tracking-[0.25em] text-white/30">
                  TOTAL STAFF
                </div>

                <div
                  className="mt-4 text-5xl"
                  style={{
                    fontWeight: 250,
                    letterSpacing: "-0.08em",
                  }}
                >
                  {
                    staff.length
                  }
                </div>

              </div>

              <div className="rounded-[24px] border border-white/10 bg-[#111117] p-6">

                <div className="text-[11px] tracking-[0.25em] text-white/30">
                  ACTIVE SYSTEM
                </div>

                <div
                  className="mt-5 text-xl text-green-400"
                  style={{
                    fontWeight: 300,
                  }}
                >
                  OPERATIONAL
                </div>

              </div>

              <div className="rounded-[24px] border border-white/10 bg-[#111117] p-6">

                <div className="text-[11px] tracking-[0.25em] text-white/30">
                  TENANT
                </div>

                <div
                  className="mt-5 text-sm text-white/60"
                  style={{
                    fontWeight: 300,
                  }}
                >
                  {
                    tenantId
                  }
                </div>

              </div>

            </div>

            {/* STAFF TABLE */}
            <div className="overflow-hidden rounded-[24px] border border-white/10 bg-[#111117]">

              <div className="grid grid-cols-4 border-b border-white/10 px-6 py-4 text-[11px] tracking-[0.25em] text-white/30">

                <div>
                  NAME
                </div>

                <div>
                  EMAIL
                </div>

                <div>
                  ROLE
                </div>

                <div>
                  STATUS
                </div>

              </div>

              <div className="divide-y divide-white/5">

                {staff.map(
                  (member) => (

                    <div
                      key={member.id}
                      className="grid grid-cols-4 items-center px-6 py-5 transition hover:bg-white/[0.02]"
                    >

                      <div
                        className="text-lg"
                        style={{
                          fontWeight: 300,
                          letterSpacing: "-0.03em",
                        }}
                      >
                        {
                          member.name ||
                          "Unknown"
                        }
                      </div>

                      <div className="text-white/50">
                        {
                          member.email
                        }
                      </div>

                      <div>

                        <div className="inline-flex rounded-full border border-[#8B5CF6]/20 bg-[#8B5CF6]/10 px-3 py-1 text-[11px] tracking-[0.15em] text-[#B58AF8]">
                          {
                            member.role ||
                            "STAFF"
                          }
                        </div>

                      </div>

                      <div>

                        <div className="inline-flex rounded-full border border-green-500/20 bg-green-500/10 px-3 py-1 text-[11px] tracking-[0.15em] text-green-400">
                          ACTIVE
                        </div>

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
