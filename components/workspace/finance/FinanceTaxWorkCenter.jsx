"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import FinanceTaxLegacyWorkCenter from "./FinanceTaxLegacyWorkCenter";
import FinanceTaxReturnCloseSheet from "./FinanceTaxReturnCloseSheet";
import FinanceTaxCalendarRail from "./FinanceTaxCalendarRail";
import FinanceTaxPostFilingWorkspace from "./FinanceTaxPostFilingWorkspace";
import FinanceTaxPortfolioRail from "./FinanceTaxPortfolioRail";
import FinanceTaxCloseIntelligenceRail from "./FinanceTaxCloseIntelligenceRail";
import FinanceTaxEvidenceDrilldownRail from "./FinanceTaxEvidenceDrilldownRail";
import FinanceTaxDependencyWorkRail from "./FinanceTaxDependencyWorkRail";
import FinanceTaxClientRequestBridgeRail from "./FinanceTaxClientRequestBridgeRail";
import FinanceTaxWorkflowNavigator from "./FinanceTaxWorkflowNavigator";

const TAX_STAGES = new Set(["RETURN", "FIX", "EVIDENCE", "AFTER"]);

function normalizedStage(value) {
  const stage = String(value || "").trim().toUpperCase();
  return TAX_STAGES.has(stage) ? stage : "RETURN";
}

export default function FinanceTaxWorkCenter(props) {
  const searchParams = useSearchParams();
  const requestedVatReturnId = String(searchParams?.get("vatReturnId") || "").trim() || null;
  const requestedStage = normalizedStage(searchParams?.get("stage"));
  const requestedDependencyCode = String(searchParams?.get("dependencyCode") || "").trim().toUpperCase() || null;
  const taxSourceReturn = searchParams?.get("source") === "tax-source-return";

  // One filing selection is authoritative for every entity-level Tax control below.
  const [selectedVatReturnId, setSelectedVatReturnIdState] = useState(requestedVatReturnId);
  const [activeStage, setActiveStage] = useState(requestedVatReturnId ? requestedStage : "RETURN");
  const [evidenceFocusCode, setEvidenceFocusCode] = useState(requestedStage === "EVIDENCE" ? requestedDependencyCode : null);

  useEffect(() => {
    if (!taxSourceReturn || !requestedVatReturnId) return;
    setSelectedVatReturnIdState(requestedVatReturnId);
    setActiveStage(requestedStage);
    setEvidenceFocusCode(requestedStage === "EVIDENCE" ? requestedDependencyCode : null);
  }, [taxSourceReturn, requestedVatReturnId, requestedStage, requestedDependencyCode]);

  function setSelectedVatReturnId(nextId) {
    setSelectedVatReturnIdState(nextId);
    setEvidenceFocusCode(null);
    if (!nextId) setActiveStage("RETURN");
  }

  function changeStage(nextStage) {
    setEvidenceFocusCode(null);
    setActiveStage(normalizedStage(nextStage));
  }

  function openEvidence(dependencyCode = null) {
    setEvidenceFocusCode(dependencyCode || null);
    setActiveStage("EVIDENCE");
  }

  return (
    <>
      <FinanceTaxPortfolioRail
        organizationId={props.organizationId}
        entityId={props.entityId}
        selectedVatReturnId={selectedVatReturnId}
        onSelectedVatReturnIdChange={setSelectedVatReturnId}
      />

      <FinanceTaxWorkflowNavigator
        activeStage={activeStage}
        onStageChange={changeStage}
        selectedVatReturnId={selectedVatReturnId}
      />

      {taxSourceReturn && selectedVatReturnId ? <div className="mx-auto mt-3 max-w-[1760px] px-4 sm:px-5 lg:px-6">
        <div className="rounded-xl border border-emerald-700/15 bg-emerald-50 px-3.5 py-2.5 text-[9px] leading-4 text-emerald-900">
          <b>Returned to the same VAT filing.</b> Live Tax evidence is being rebuilt from the corrected source record{requestedDependencyCode ? ` for ${requestedDependencyCode.replaceAll("_", " ").toLowerCase()}` : ""}. The blocker only clears if current accounting truth now passes preflight.
        </div>
      </div> : null}

      {activeStage === "RETURN" ? <>
        <FinanceTaxCalendarRail organizationId={props.organizationId} entityId={props.entityId} selectedVatReturnId={selectedVatReturnId} />
        <FinanceTaxReturnCloseSheet
          organizationId={props.organizationId}
          entityId={props.entityId}
          selectedVatReturnId={selectedVatReturnId}
          onStageChange={changeStage}
          onEvidenceFocus={openEvidence}
        />
        <details className="mx-auto mt-3 max-w-[1760px] overflow-hidden rounded-xl border border-black/[0.07] bg-white shadow-[0_6px_24px_rgba(35,31,27,0.025)]">
          <summary className="cursor-pointer list-none px-4 py-3 outline-none marker:hidden">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div>
                <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#817B73]">Filing register & detailed source evidence</div>
                <div className="mt-0.5 text-[10px] text-[#817B73]">Open only to create another filing, switch periods, or inspect the detailed source preview. The VAT close sheet remains the primary filing control.</div>
              </div>
              <span className="shrink-0 text-[9px] font-semibold text-[#8C6036]">Open filing register</span>
            </div>
          </summary>
          <div className="border-t border-black/[0.07]">
            <FinanceTaxLegacyWorkCenter
              {...props}
              selectedVatReturnId={selectedVatReturnId}
              onSelectedVatReturnIdChange={setSelectedVatReturnId}
            />
          </div>
        </details>
      </> : null}

      {activeStage === "FIX" ? <>
        <FinanceTaxDependencyWorkRail
          organizationId={props.organizationId}
          entityId={props.entityId}
          selectedVatReturnId={selectedVatReturnId}
          onStageChange={changeStage}
          onEvidenceFocus={openEvidence}
        />

        <details className="mx-auto mt-3 max-w-[1760px] overflow-hidden rounded-xl border border-black/[0.07] bg-white shadow-[0_6px_24px_rgba(35,31,27,0.025)]">
          <summary className="cursor-pointer list-none px-4 py-3 outline-none marker:hidden">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div>
                <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#817B73]">Optional support · client evidence & governed intelligence</div>
                <div className="mt-0.5 text-[10px] text-[#817B73]">Open only when the live blocker needs an existing client request or an explanation. Neither surface can clear Tax truth, post accounting, send communication or file the return.</div>
              </div>
              <span className="shrink-0 text-[9px] font-semibold text-[#8C6036]">Open supporting tools</span>
            </div>
          </summary>
          <div className="border-t border-black/[0.07] bg-[#FAF9F7] pb-3">
            <FinanceTaxClientRequestBridgeRail organizationId={props.organizationId} entityId={props.entityId} selectedVatReturnId={selectedVatReturnId} />
            <FinanceTaxCloseIntelligenceRail organizationId={props.organizationId} entityId={props.entityId} selectedVatReturnId={selectedVatReturnId} />
          </div>
        </details>
      </> : null}

      {activeStage === "EVIDENCE" ? <FinanceTaxEvidenceDrilldownRail
        organizationId={props.organizationId}
        entityId={props.entityId}
        selectedVatReturnId={selectedVatReturnId}
        focusDependencyCode={evidenceFocusCode}
        onStageChange={changeStage}
      /> : null}

      {/* AFTER delegates the governed FinanceTaxAmendmentRail and FinanceTaxSettlementRail controls to one post-filing workspace so they never compete as stacked primary surfaces. */}
      {activeStage === "AFTER" ? <FinanceTaxPostFilingWorkspace
        organizationId={props.organizationId}
        entityId={props.entityId}
        selectedVatReturnId={selectedVatReturnId}
        onStageChange={changeStage}
      /> : null}
    </>
  );
}
