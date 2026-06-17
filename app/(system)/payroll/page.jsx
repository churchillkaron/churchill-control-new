"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { DollarSign, Users } from "lucide-react";
import PageWrapper from "@/components/PageWrapper";
import { PAYROLL_STATUS } from "@/lib/payroll/consolidation/payrollStatusMachine";
import { getTenantId, loadStaff, createRealtimeChannel } from "@/domains/hospitality/loaders/loadOperationalData";
import { supabase } from "@/lib/shared/supabase/client";

export default function PayrollPage() {
  const [tenantId, setTenantId] = useState(null);
  const [staff, setStaff] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  async function loadPayroll(activeTenantId) {
    try {
      const staffData = await loadStaff(activeTenantId);

      const { data: orderData } = await supabase
        .from("orders")
        .select("*")
        .eq("tenant_id", activeTenantId)
        .eq("payment_status", PAYROLL_STATUS.PAID);

      setStaff(staffData || []);
      setOrders(orderData || []);
    } catch (error) {
      console.error("PAYROLL_LOAD_ERROR", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    async function boot() {
      try {
        const currentTenant = await getTenantId();
        if (!currentTenant) {
          setLoading(false);
          return;
        }

        setTenantId(currentTenant);
        await loadPayroll(currentTenant);

        createRealtimeChannel({
          name: "payroll-live",
          tables: ["orders", "staff_accounts"],
          callback: () => loadPayroll(currentTenant),
        });
      } catch (error) {
        console.error(error);
        setLoading(false);
      }
    }
    boot();
  }, []);

  async function generatePayroll() {
    try {
      setGenerating(true);
      const response = await fetch("/api/payroll/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, payrollMonth: "2026-06" }),
      });

      const result = await response.json();
      console.log("PAYROLL_GENERATE_RESULT", result);
      alert(result.success ? "Payroll generated" : result.error);
    } catch (error) {
      console.error(error);
    } finally {
      setGenerating(false);
    }
  }

  const totalRevenue = orders.reduce(
    (sum, order) => sum + Number(order.final_amount || 0),
    0
  );

  const staffCount = staff.length;

  const totalServiceCharge = orders.reduce(
    (sum, order) => sum + Number(order.service_charge || 0),
    0
  );

  const avgPayout = totalServiceCharge / Math.max(1, staffCount);

  return (
    <PageWrapper title="Payroll" subtitle="Enterprise payroll operations">
      {loading ? (
        <div className="text-white/40">Loading payroll...</div>
      ) : (
        <>
          <div className="mb-6 flex justify-end">
            <button
              onClick={generatePayroll}
              disabled={generating}
              className="rounded-2xl border border-[#D6A66A]/30 bg-[#D6A66A]/10 px-6 py-3 text-sm font-medium text-[#D6A66A]"
            >
              {generating ? "Generating..." : "Generate Payroll"}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
            <div className="rounded-[28px] border border-white/10 bg-[#111117] p-6">
              <div className="flex items-center gap-2 text-white/50 text-sm">
                <DollarSign className="w-4 h-4" />
                Revenue
              </div>
              <div className="mt-4 text-5xl">฿{Math.round(totalRevenue)}</div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-[#111117] p-6">
              <div className="text-white/50 text-sm">Service Charge</div>
              <div className="mt-4 text-5xl">฿{Math.round(totalServiceCharge)}</div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-[#111117] p-6">
              <div className="flex items-center gap-2 text-white/50 text-sm">
                <Users className="w-4 h-4" />
                Staff
              </div>
              <div className="mt-4 text-5xl">{staffCount}</div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-[#111117] p-6">
              <div className="text-white/50 text-sm">Avg Payout</div>
              <div className="mt-4 text-5xl">฿{Math.round(avgPayout)}</div>
            </div>
          </div>
        </>
      )}
    </PageWrapper>
  );
}
