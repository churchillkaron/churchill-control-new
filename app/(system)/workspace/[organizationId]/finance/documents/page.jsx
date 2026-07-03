"use client";

import { useEffect, useState } from "react";
import { useFinanceRuntime } from "@/lib/finance/runtime/useFinanceRuntime";
import { financeFetch } from "@/lib/finance/runtime/financeFetch";

export const dynamic = "force-dynamic";

export default function FinanceDocumentsPage() {

  const [documents,setDocuments] =
    useState([]);

  const [loading,setLoading] =
    useState(true);

  useEffect(()=>{

    fetch("/api/finance/documents")

      .then(r=>r.json())

      .then(data=>{

        setDocuments(
          data.documents || []
        );

        setLoading(false);

      })

      .catch(()=>{

        setDocuments([]);

        setLoading(false);

      });

  },[]);

  return (

    <main className="min-h-screen p-8 text-white">

      <div className="mx-auto max-w-7xl">

        <div>

          <div className="text-xs uppercase tracking-[0.35em] text-white/50">
            Finance
          </div>

          <h1 className="mt-3 text-4xl font-light">
            Finance Documents
          </h1>

          <p className="mt-2 text-white/60">
            Canonical finance business documents.
          </p>

        </div>

        <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] overflow-hidden">

          <table className="w-full">

            <thead>

              <tr className="border-b border-white/10">

                <th className="p-4 text-left">
                  Document
                </th>

                <th className="p-4 text-left">
                  Context
                </th>

                <th className="p-4 text-left">
                  Route
                </th>

                <th className="p-4 text-left">
                  Lifecycle
                </th>

              </tr>

            </thead>

            <tbody>

              {loading && (

                <tr>

                  <td
                    colSpan={4}
                    className="p-6"
                  >
                    Loading...
                  </td>

                </tr>

              )}

              {!loading &&

                documents.map(doc=>(

                  <tr
                    key={doc.id}
                    className="border-t border-white/5"
                  >

                    <td className="p-4">
                      {doc.name}
                    </td>

                    <td className="p-4">
                      {doc.context}
                    </td>

                    <td className="p-4">
                      {doc.route}
                    </td>

                    <td className="p-4">
                      {doc.lifecycle.join(" → ")}
                    </td>

                  </tr>

              ))}

            </tbody>

          </table>

        </div>

      </div>

    </main>

  );

}
