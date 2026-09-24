"use client";

import { useState } from "react";

import ReportEngine from "@/components/workspace/engines/ReportEngine";
import PreviewEngine from "@/components/workspace/engines/PreviewEngine";

function reportActions(capability){

  return (
    capability?.actions ||
    []
  ).filter(
    action =>
      action?.type === "report"
  );

}


export default function ReportWorkCenter({

  capability,

  organizationId,

  entityId,

  periodId,

  workspaceId,

}) {

  const reports =
    reportActions(capability);


  console.log(
    "REPORT ACTIONS DEBUG",
    {
      capability,
      reports,
    }
  );


  const [selectedReport,setSelectedReport] =
    useState(
      reports[0] || null
    );


  const [open,setOpen] =
    useState(false);

  const [preview,setPreview] =
    useState(null);


  return (

    <>

      <div className="space-y-6">


        <div className="rounded-[30px] border border-black/[0.08] bg-gradient-to-b from-white/[0.045] to-white/[0.018] p-6 shadow-2xl shadow-black/10 backdrop-blur-3xl">

          <div className="text-[11px] uppercase tracking-[0.28em] text-[#918B83]">
            Reporting
          </div>


          <h1 className="mt-3 text-3xl font-light tracking-[-0.05em] text-[#191919]">
            {capability?.name || "Report"}
          </h1>


          <p className="mt-2 text-sm text-[#746E66]">
            {capability?.description || "Generate business reports."}
          </p>


          <div className="mt-6 flex flex-wrap gap-3">

            {reports.map(report => (

              <button

                key={report.id}

                onClick={() =>
                  setSelectedReport(report)
                }

                className={
                  [
                    "rounded-xl border px-4 py-2 text-sm transition",

                    selectedReport?.id === report.id

                    ? "border-amber-300/20 bg-amber-300/[0.08] text-amber-200"

                    : "border-black/[0.08] bg-[#FBF8F3] text-[#191919]/58 backdrop-blur-2xl"

                  ].join(" ")
                }

              >

                {report.label || report.id}

              </button>

            ))}

          </div>


          <button

            onClick={() => setOpen(true)}

            disabled={!selectedReport}

            className="mt-6 rounded-xl border border-amber-300/35 bg-gradient-to-b from-amber-200 to-amber-500 px-5 py-3 text-sm font-semibold text-black shadow-[0_0_34px_rgba(245,158,11,0.22)] disabled:opacity-40"

          >

            Generate Report

          </button>


        </div>


      </div>


      {open && selectedReport && (

        <ReportEngine

          organizationId={organizationId}

          entityId={entityId}

          periodId={periodId}

          initialPayload={{

            workspaceId,

            moduleKey:
              capability?.id,

            organizationId,

            entityId,

            periodId,

            action:
              selectedReport,

          }}

          onClose={() =>
            setOpen(false)
          }

          onPreview={(previewPayload) => {
            setOpen(false);
            setPreview(previewPayload);
          }}

        />

      )}


      {preview && (

        <PreviewEngine

          {...preview}

          onClose={() =>
            setPreview(null)
          }

        />

      )}

    </>

  );

}
