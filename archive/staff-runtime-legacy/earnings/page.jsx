"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  Wallet,
  Download,
  Crown,
  Sparkles,
} from "lucide-react";

export default function StaffEarningsPage() {

  const [records, setRecords] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {

    loadPayroll();

  }, []);

  async function loadPayroll() {

    try {

      const res =
        await fetch(
          "/api/staff/profile-overview?tenant_id=76e2caa6-dd78-49e5-b0f5-1ff94185c2d4&email=patric@harrysphuket.com"
        );

      const data =
        await res.json();

      setRecords(
        data?.profile?.payroll ||
        []
      );

    } catch (err) {

      console.error(err);

    } finally {

      setLoading(false);

    }

  }

  const total =
    records.reduce(
      (
        sum,
        row
      ) => {

        return (
          sum +
          Number(
            row.final_salary ||
            row.total_salary ||
            0
          )
        );

      },
      0
    );

  return (

    <div className="min-h-screen bg-black px-5 py-10 text-white">

      <div className="mx-auto max-w-6xl">

        <div className="overflow-hidden rounded-[40px] border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-black to-black p-8">

          <div className="flex items-center justify-between">

            <div>

              <div className="text-[11px] uppercase tracking-[0.35em] text-emerald-300">
                Churchill Payroll
              </div>

              <div className="mt-3 text-6xl font-black">
                Salary Vault
              </div>

              <div className="mt-3 text-white/40">
                Realtime payroll intelligence and payout visibility.
              </div>

            </div>

            <div className="hidden md:flex h-28 w-28 items-center justify-center rounded-full bg-emerald-500/10">

              <Wallet className="h-14 w-14 text-emerald-300" />

            </div>

          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">

            <div className="rounded-[30px] border border-white/10 bg-white/[0.04] p-5">

              <div className="text-sm uppercase tracking-[0.25em] text-white/40">
                Total Earnings
              </div>

              <div className="mt-3 text-4xl font-black text-emerald-300">

                ฿
                {total.toLocaleString()}

              </div>

            </div>

            <div className="rounded-[30px] border border-white/10 bg-white/[0.04] p-5">

              <div className="text-sm uppercase tracking-[0.25em] text-white/40">
                Payroll Status
              </div>

              <div className="mt-3 flex items-center gap-2 text-3xl font-black text-cyan-300">

                <Sparkles className="h-7 w-7" />

                Active

              </div>

            </div>

            <div className="rounded-[30px] border border-white/10 bg-white/[0.04] p-5">

              <div className="text-sm uppercase tracking-[0.25em] text-white/40">
                Performance Rank
              </div>

              <div className="mt-3 flex items-center gap-2 text-3xl font-black text-amber-300">

                <Crown className="h-7 w-7" />

                Elite

              </div>

            </div>

          </div>

        </div>

        <div className="mt-8 space-y-4">

          {loading && (

            <div className="rounded-[30px] border border-white/10 bg-white/[0.04] p-6 text-white/50">
              Loading payroll runtime...
            </div>

          )}

          {!loading &&
            records.map(
              (
                row,
                index
              ) => (

                <div
                  key={index}
                  className="rounded-[32px] border border-white/10 bg-white/[0.04] p-6"
                >

                  <div className="flex items-center justify-between">

                    <div>

                      <div className="text-2xl font-bold">
                        Payroll Record
                      </div>

                      <div className="mt-2 text-white/40">
                        {new Date(
                          row.created_at
                        ).toLocaleDateString()}
                      </div>

                    </div>

                    <div className="text-right">

                      <div className="text-4xl font-black text-emerald-300">

                        ฿
                        {Number(
                          row.final_salary ||
                          row.total_salary ||
                          0
                        ).toLocaleString()}

                      </div>

                      <div className="mt-2 text-sm text-white/40">
                        Final Salary
                      </div>

                    </div>

                  </div>

                  <div className="mt-5 flex justify-end">

                    <button
                      className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/40 px-5 py-3 text-sm"
                    >

                      <Download className="h-4 w-4" />

                      Payslip

                    </button>

                  </div>

                </div>

              )
            )}

        </div>

      </div>

    </div>

  );

}
