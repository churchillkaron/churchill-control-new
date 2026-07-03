"use client";

import { useEffect, useState } from "react";
import ExportEngine from "./engines/ExportEngine";
import ImportEngine from "./engines/ImportEngine";
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

  const [communication,setCommunication]=
    useState(null);

  useEffect(()=>{

    const exportHandler=e=>
      setExportAction(e.detail);

    const importHandler=e=>
      setImportAction(e.detail);

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
