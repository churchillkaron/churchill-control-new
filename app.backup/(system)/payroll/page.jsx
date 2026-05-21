"use client";

export const dynamic = "force-dynamic";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  DollarSign,
  Users,
  Clock3,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

import PageWrapper from "@/components/PageWrapper";

import {
  supabase,
} from "@/lib/shared/supabase/client";

import {
  getTenantId,
  loadStaff,
  createRealtimeChannel,
} from "@/lib/shared/loaders/loadOperationalData";

export default function PayrollPage() {

  const [tenantId, setTenantId] =
    useState(null);

  const [staff, setStaff] =
    useState([]);

  const [orders, setOrders] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  // ====================================
  // LOAD
  // ====================================

  async function loadPayroll(
    activeTenantId
  ) {

    const staffData =
      await loadStaff(
        activeTenantId
      );

    const {
      data: orderData,
    } = await supabase

      .from("orders")

      .select("*")

      .eq(
        "tenant_id",
        activeTenantId
      )

      .eq(
        "payment_status",
        "PAID"
      );

    setStaff(
      staffData || []
    );

    setOrders(
      orderData || []
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

      await loadPayroll(
        currentTenant
      );

      const realtime =
        createRealtimeChannel({

          name:
            "payroll-live",

          tables: [
            "orders",
            "staff_accounts",
          ],

          callback: () =>
            loadPayroll(
              currentTenant
            ),

        });

      return () => realtime;

    }

    boot();

  }, []);

  // ====================================
  // METRICS
  // ====================================

  const metrics =
    useMemo(() => {

      const revenue =
        orders.reduce(
          (sum, order) =>

            sum +

            Number(
              order.final_total ||

              order.total_amount ||

              0
            ),

          0
        );

      const serviceCharge =
        revenue * 0.05;

      const staffCount =
        staff.length;

      const estimatedPayout =
        serviceCharge /
        Math.max(
          1,
          staffCount
        );

      return {

        revenue,

        serviceCharge,

        staffCount,

        estimatedPayout,
      };

    }, [
      orders,
      staff,
    ]);

  return (

    <PageWrapper
      title="Payroll"
      subtitle="Enterprise payroll operations"
    >

      {loading ? (

        <div className="text-white/40">
          Loading payroll...
        </div>

      ) : (

        <div className="space-y-6">

          {/* KPI */}
          <div className="grid grid-cols-4 gap-5">

            <div className="rounded-[28px] border border-emerald-500/20 bg-emerald-500/10 p-6">

              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-emerald-300 mb-4">

                <DollarSign className="w-4 h-4" />

                Revenue

              </div>

              <div className="text-4xl font-light text-emerald-400">
                ฿{
                  metrics.revenue.toLocaleString()
                }
              </div>

            </div>

            <div className="rounded-[28px] border border-violet-500/20 bg-violet-500/10 p-6">

              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-violet-300 mb-4">

                <TrendingUp className="w-4 h-4" />

                Service Charge

              </div>

              <div className="text-4xl font-light text-violet-400">
                ฿{
                  metrics.serviceCharge.toFixed(2)
                }
              </div>

            </div>

            <div className="rounded-[28px] border border-cyan-500/20 bg-cyan-500/10 p-6">

              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-cyan-300 mb-4">

                <Users className="w-4 h-4" />

                Staff

              </div>

              <div className="text-4xl font-light text-cyan-400">
                {
                  metrics.staffCount
                }
              </div>

            </div>

            <div className="rounded-[28px] border border-orange-500/20 bg-orange-500/10 p-6">

              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-orange-300 mb-4">

                <Clock3 className="w-4 h-4" />

                Avg Payout

              </div>

              <div className="text-4xl font-light text-orange-400">
                ฿{
                  metrics.estimatedPayout.toFixed(2)
                }
              </div>

            </div>

          </div>

          {/* STAFF PAYROLL */}
          <div className="rounded-[30px] border border-white/10 bg-white/[0.03] overflow-hidden">

            <div className="grid grid-cols-6 gap-4 px-6 py-5 border-b border-white/5 text-xs uppercase tracking-[0.2em] text-white/40">

              <div>Staff</div>
              <div>Role</div>
              <div>Status</div>
              <div>Service Share</div>
              <div>Attendance</div>
              <div>Payout</div>

            </div>

            <div className="divide-y divide-white/5">

              {staff.map(member => {

                const payout =
                  metrics.estimatedPayout;

                return (

                  <div
                    key={member.id}
                    className="grid grid-cols-6 gap-4 px-6 py-5 items-center"
                  >

                    <div>

                      <div className="text-lg">
                        {
                          member.name
                        }
                      </div>

                    </div>

                    <div className="text-white/60">

                      {
                        member.role
                      }

                    </div>

                    <div>

                      <div className="inline-flex items-center gap-2 px-4 h-10 rounded-2xl bg-emerald-500 text-black text-xs uppercase tracking-[0.2em]">

                        <CheckCircle2 className="w-4 h-4" />

                        Active

                      </div>

                    </div>

                    <div className="text-lg">
                      ฿{
                        payout.toFixed(2)
                      }
                    </div>

                    <div>

                      <div className="inline-flex items-center gap-2 px-4 h-10 rounded-2xl bg-white/5 text-xs uppercase tracking-[0.2em]">

                        100%

                      </div>

                    </div>

                    <div className="text-xl text-emerald-400">
                      ฿{
                        payout.toFixed(2)
                      }
                    </div>

                  </div>

                );

              })}

            </div>

          </div>

          {/* ALERTS */}
          <div className="rounded-[30px] border border-red-500/20 bg-red-500/10 p-6">

            <div className="flex items-center gap-3 mb-4">

              <AlertTriangle className="w-5 h-5 text-red-400" />

              <div className="text-2xl font-light text-red-400">
                Payroll Alerts
              </div>

            </div>

            <div className="space-y-2 text-white/70">

              <div>
                • Verify attendance integration before payout approval
              </div>

              <div>
                • Verify management approval workflow
              </div>

              <div>
                • Verify accounting release flow
              </div>

            </div>

          </div>

        </div>

      )}

    </PageWrapper>

  );

}
