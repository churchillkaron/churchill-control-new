"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  FileText,
  Upload,
  Shield,
  Receipt,
  FileCheck,
  Download,
} from "lucide-react";

export default function StaffDocumentsPage() {

  const [documents, setDocuments] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {

    loadDocuments();

  }, []);

  async function loadDocuments() {

    try {

      const res =
        await fetch(
          "/api/staff/profile-overview?tenant_id=76e2caa6-dd78-49e5-b0f5-1ff94185c2d4&email=patric@harrysphuket.com"
        );

      const data =
        await res.json();

      const payroll =
        data?.profile?.payroll ||
        [];

      const generated = [

        {
          title:
            "Employment Contract",
          status:
            "Verified",
          icon:
            FileCheck,
          color:
            "text-emerald-300",
        },

        {
          title:
            "Identity Verification",
          status:
            "Protected",
          icon:
            Shield,
          color:
            "text-cyan-300",
        },

        ...payroll.map(
          (
            row,
            index
          ) => ({

            title:
              `Payroll Record ${index + 1}`,

            status:
              "Available",

            icon:
              Receipt,

            color:
              "text-amber-300",

            amount:
              row.final_salary ||
              row.total_salary,

            created_at:
              row.created_at,

          })
        ),

      ];

      setDocuments(
        generated
      );

    } catch (err) {

      console.error(err);

    } finally {

      setLoading(false);

    }

  }

  return (

    <div className="min-h-screen bg-black px-5 py-10 text-white">

      <div className="mx-auto max-w-6xl">

        <div className="mb-10">

          <div className="text-[11px] uppercase tracking-[0.35em] text-cyan-300">
            Churchill Staff Vault
          </div>

          <div className="mt-3 flex items-center gap-3 text-5xl font-black">

            <FileText className="h-10 w-10 text-cyan-300" />

            Documents Runtime

          </div>

          <div className="mt-3 text-white/40">
            Live contracts, payroll files, verification and operational documents.
          </div>

        </div>

        <div className="space-y-5">

          {loading && (

            <div className="rounded-[30px] border border-white/10 bg-white/[0.04] p-6 text-white/50">
              Loading staff vault...
            </div>

          )}

          {!loading &&
            documents.map(
              (
                doc,
                index
              ) => {

                const Icon =
                  doc.icon;

                return (

                  <div
                    key={index}
                    className="rounded-[34px] border border-white/10 bg-white/[0.04] p-6"
                  >

                    <div className="flex items-center justify-between">

                      <div className="flex items-center gap-5">

                        <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-black/40">

                          <Icon className={`h-8 w-8 ${doc.color}`} />

                        </div>

                        <div>

                          <div className="text-2xl font-black">
                            {doc.title}
                          </div>

                          <div className={`mt-2 text-sm ${doc.color}`}>
                            {doc.status}
                          </div>

                          {doc.amount && (

                            <div className="mt-2 text-white/40">

                              ฿
                              {Number(
                                doc.amount
                              ).toLocaleString()}

                            </div>

                          )}

                        </div>

                      </div>

                      <button
                        className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/40 px-5 py-3 text-sm"
                      >

                        <Download className="h-4 w-4" />

                        Open

                      </button>

                    </div>

                  </div>

                );

              }
            )}

        </div>

        <div className="mt-8 rounded-[34px] border border-dashed border-white/10 bg-white/[0.03] p-10 text-center">

          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-cyan-500/10">

            <Upload className="h-10 w-10 text-cyan-300" />

          </div>

          <div className="mt-5 text-2xl font-black">
            Upload Operational Files
          </div>

          <div className="mt-3 text-white/40">
            Contracts, certifications, payroll exports and operational reports.
          </div>

          <button className="mt-6 rounded-2xl bg-gradient-to-br from-cyan-500 via-violet-500 to-fuchsia-500 px-6 py-3 font-semibold text-white">

            Upload Files

          </button>

        </div>

      </div>

    </div>

  );

}
