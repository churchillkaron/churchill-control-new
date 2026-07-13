"use client";

import { useEffect, useState } from "react";
import ExportEngine from "./engines/ExportEngine";
import ImportEngine from "./engines/ImportEngine";
import ReportEngine from "./engines/ReportEngine";
import PreviewEngine from "./engines/PreviewEngine";
import { CommunicationEngine } from "./engines";
import InternalMessageDialog from "./engines/InternalMessageDialog";

export default function WorkspaceEventHub({

  organizationId,

  entityId,

  periodId,

}){

  const [exportAction,setExportAction]=
    useState(null);

  const [importAction,setImportAction]=
    useState(null);

  const [reportAction,setReportAction]=
    useState(null);

  const [preview,setPreview]=
    useState(null);

  const [communication,setCommunication]=
    useState(null);

  useEffect(()=>{

    const exportHandler=e=>
      setExportAction(e.detail);

    const importHandler=e=>
      setImportAction(e.detail);

    const reportHandler=e=>
      setReportAction(e.detail);

    const previewHandler=e=>
      setPreview(e.detail);

    const communicationHandler=e=>
      setCommunication(e.detail);

    window.addEventListener(
      "workspace:export",
      exportHandler
    );

    window.addEventListener(
      "workspace:import",
      importHandler
    );

    window.addEventListener(
      "workspace:report",
      reportHandler
    );

    window.addEventListener(
      "workspace:reports",
      reportHandler
    );

    window.addEventListener(
      "workspace:preview",
      previewHandler
    );

    window.addEventListener(
      "workspace:communication",
      communicationHandler
    );

    return()=>{

      window.removeEventListener(
        "workspace:export",
        exportHandler
      );

      window.removeEventListener(
        "workspace:import",
        importHandler
      );

      window.removeEventListener(
        "workspace:report",
        reportHandler
      );

      window.removeEventListener(
        "workspace:reports",
        reportHandler
      );

      window.removeEventListener(
        "workspace:preview",
        previewHandler
      );

      window.removeEventListener(
        "workspace:communication",
        communicationHandler
      );

    };

  },[]);

  return(

    <>

      {exportAction && (

        <ExportEngine

          action={exportAction.action}

          organizationId={organizationId}

          entityId={entityId}

          periodId={periodId}

          moduleKey={exportAction.moduleKey}

          label=""

          className="hidden"

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


      {reportAction && (

        <ReportEngine

          organizationId={organizationId}

          entityId={entityId}

          periodId={periodId}

          initialPayload={reportAction}

          onClose={() => setReportAction(null)}

        />

      )}

{importAction && (

        <ImportEngine

          action={importAction.action}

          organizationId={organizationId}

          entityId={entityId}

          periodId={periodId}

          moduleKey={importAction.moduleKey}

          label=""

          className="hidden"

        />

      )}

      <InternalMessageDialog

        open={!!communication}

        payload={communication}

        onClose={()=>
          setCommunication(null)
        }

      />

    </>

  );

}
