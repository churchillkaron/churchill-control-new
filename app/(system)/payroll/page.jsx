"use client";

import { useEffect, useState } from "react";

import calculatePayroll from "@/lib/payroll/calculatePayroll";

export default function PayrollPage() {

  const [
    payrollData,
    setPayrollData,
  ] = useState(null);

  const [
    loading,
    setLoading,
  ] = useState(false);

  async function loadPayroll() {

    try {

      setLoading(true);

      const result =
        await calculatePayroll({

          tenant_id:
            "demo",
        });

      setPayrollData(
        result
      );

    } finally {

      setLoading(false);
    }
  }

  useEffect(() => {

    loadPayroll();

  }, []);

  return (

    <div className="min-h-screen bg-black text-white p-10">

      <div className="max-w-7xl mx-auto">

        <h1 className="text-6xl font-bold mb-3">
          Payroll
        </h1>

        <div className="text-zinc-500 mb-10">
          Staff Salary Intelligence
        </div>

        {loading && (

          <div>
            Loading payroll...
          </div>
        )}

        {payrollData?.success && (

          <div className="space-y-4">

            <div className="border border-zinc-800 rounded-3xl p-8">

              <div className="text-zinc-500 text-sm">
                Total Payroll
              </div>

              <div className="text-5xl font-bold mt-4">
                ฿
                {
                  payrollData.total_payroll
                }
              </div>

            </div>

            {payrollData.payroll?.map(
              (
                item
              ) => (

                <div
                  key={item.user_id}
                  className="border border-zinc-800 rounded-3xl p-6"
                >

                  <div className="flex items-center justify-between">

                    <div>

                      <div className="text-2xl font-bold">
                        {
                          item.role
                        }
                      </div>

                      <div className="text-zinc-500 mt-2">
                        {
                          item.user_id
                        }
                      </div>

                    </div>

                    <div className="text-3xl font-bold">

                      ฿
                      {
                        item.salary
                      }

                    </div>

                  </div>

                </div>
              )
            )}

          </div>
        )}

      </div>

    </div>
  );
}
