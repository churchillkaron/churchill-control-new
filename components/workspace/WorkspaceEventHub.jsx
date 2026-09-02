"use client";

import { useEffect, useState } from "react";
import ExportEngine from "./engines/ExportEngine";
import ImportEngine from "./engines/ImportEngine";
import ReportEngine from "./engines/ReportEngine";
import PreviewEngine from "./engines/PreviewEngine";
import { CommunicationEngine } from "./engines";
import InternalMessageDialog from "./engines/InternalMessageDialog";
import { getClientEngine } from "@/lib/platform/engines/ClientEngineRegistry";

export default function WorkspaceEventHub({
  organizationId,
  entityId,
  periodId,
}) {
  const [exportAction, setExportAction] = useState(null);
  const [importAction, setImportAction] = useState(null);
  const [reportAction, setReportAction] = useState(null);
  const [preview, setPreview] = useState(null);
  const [communication, setCommunication] = useState(null);
  const [financeEngine, setFinanceEngine] = useState(null);

  useEffect(() => {
    const exportHandler = event => setExportAction(event.detail);
    const importHandler = event => setImportAction(event.detail);
    const reportHandler = event => setReportAction(event.detail);
    const previewHandler = event => setPreview(event.detail);
    const communicationHandler = event => setCommunication(event.detail);
    const engineHandler = event => {
      const detail = event?.detail || {};
      const context = detail.context || {};
      if (String(context.workspaceId || "").toLowerCase() !== "finance") return;
      const engineId = detail?.action?.engine || detail?.engine || null;
      if (!engineId) return;
      const Engine = getClientEngine(engineId);
      if (!Engine) return;
      setFinanceEngine({
        Engine,
        action: detail.action || null,
        props: detail.props || {},
        context,
      });
    };

    window.addEventListener("workspace:export", exportHandler);
    window.addEventListener("workspace:import", importHandler);
    window.addEventListener("workspace:report", reportHandler);
    window.addEventListener("workspace:reports", reportHandler);
    window.addEventListener("workspace:preview", previewHandler);
    window.addEventListener("workspace:communication", communicationHandler);
    window.addEventListener("workspace:engine", engineHandler);

    return () => {
      window.removeEventListener("workspace:export", exportHandler);
      window.removeEventListener("workspace:import", importHandler);
      window.removeEventListener("workspace:report", reportHandler);
      window.removeEventListener("workspace:reports", reportHandler);
      window.removeEventListener("workspace:preview", previewHandler);
      window.removeEventListener("workspace:communication", communicationHandler);
      window.removeEventListener("workspace:engine", engineHandler);
    };
  }, []);

  const FinanceEngine = financeEngine?.Engine || null;

  return (
    <>
      {exportAction ? (
        <ExportEngine
          action={exportAction.action}
          organizationId={organizationId}
          entityId={entityId}
          periodId={periodId}
          moduleKey={exportAction.moduleKey}
          label=""
          className="hidden"
        />
      ) : null}

      {preview ? (
        <PreviewEngine
          {...preview}
          onClose={() => setPreview(null)}
        />
      ) : null}

      {reportAction ? (
        <ReportEngine
          organizationId={organizationId}
          entityId={entityId}
          periodId={periodId}
          initialPayload={reportAction}
          onPreview={payload => {
            setReportAction(null);
            setPreview(payload);
          }}
          onClose={() => setReportAction(null)}
        />
      ) : null}

      {importAction ? (
        <ImportEngine
          action={importAction.action}
          organizationId={organizationId}
          entityId={entityId}
          periodId={periodId}
          moduleKey={importAction.moduleKey}
          label=""
          className="hidden"
        />
      ) : null}

      {FinanceEngine ? (
        <FinanceEngine
          {...financeEngine.props}
          {...financeEngine.context}
          action={financeEngine.action}
          organizationId={financeEngine.context?.organizationId || organizationId}
          entityId={financeEngine.context?.entityId || entityId}
          periodId={financeEngine.context?.periodId || periodId}
          onClose={() => setFinanceEngine(null)}
        />
      ) : null}

      <InternalMessageDialog
        open={Boolean(communication)}
        payload={communication}
        onClose={() => setCommunication(null)}
      />
    </>
  );
}
