"use client";

export const dynamic = "force-dynamic";

import { useMemo, useState } from "react";

const sample = [
  { type:"Department", name:"Operations", code:"OPS", active:true },
  { type:"Department", name:"Finance", code:"FIN", active:true },
  { type:"Cost Center", name:"Head Office", code:"CC100", active:true },
  { type:"Cost Center", name:"Restaurant", code:"CC200", active:true },
  { type:"Project", name:"ERP Rollout", code:"PR001", active:true },
];

export default function FinanceDimensionsPage(){

  const [rows] = useState(sample);

  const stats = useMemo(()=>({

    total:rows.length,

    departments:
      rows.filter(r=>r.type==="Department").length,

    costCenters:
      rows.filter(r=>r.type==="Cost Center").length,

    projects:
      rows.filter(r=>r.type==="Project").length

  }),[rows]);

  return(

    <main className="min-h-screen p-8 text-white">

      <div className="mx-auto max-w-7xl">

        <div className="flex items-center justify-between">

          <div>

            <div className="text-xs uppercase tracking-[0.35em] text-white/50">
              Finance / Administration
            </div>

            <h1 className="mt-3 text-4xl font-light">
              Finance Dimensions
            </h1>

            <p className="mt-2 text-white/60">
              Departments, cost centres, projects and reporting dimensions.
            </p>

          </div>

        </div>

        <div className="mt-8 grid grid-cols-4 gap-4">

          <Card title="Dimensions" value={stats.total}/>
          <Card title="Departments" value={stats.departments}/>
          <Card title="Cost Centres" value={stats.costCenters}/>
          <Card title="Projects" value={stats.projects}/>

        </div>

        <div className="mt-8 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">

          <table className="w-full">

            <thead className="border-b border-white/10">

              <tr className="text-left text-sm text-white/60">

                <th className="p-4">Type</th>
                <th className="p-4">Name</th>
                <th className="p-4">Code</th>
                <th className="p-4">Status</th>

              </tr>

            </thead>

            <tbody>

              {rows.map((r,i)=>(

                <tr
                  key={i}
                  className="border-t border-white/5"
                >

                  <td className="p-4">{r.type}</td>
                  <td className="p-4">{r.name}</td>
                  <td className="p-4">{r.code}</td>
                  <td className="p-4">
                    {r.active ? "Active" : "Inactive"}
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

function Card({title,value}){

  return(

    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">

      <div className="text-sm text-white/50">
        {title}
      </div>

      <div className="mt-2 text-3xl font-light">
        {value}
      </div>

    </div>

  );

}
