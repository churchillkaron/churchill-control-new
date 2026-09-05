"use client";

import { useState } from "react";
import FinanceTaxLegacyWorkCenter from "./FinanceTaxLegacyWorkCenter";
import FinanceTaxReturnCloseSheet from "./FinanceTaxReturnCloseSheet";
import FinanceTaxCalendarRail from "./FinanceTaxCalendarRail";
import FinanceTaxAmendmentRail from "./FinanceTaxAmendmentRail";
import FinanceTaxSettlementRail from "./FinanceTaxSettlementRail";
import FinanceTaxPortfolioRail from "./FinanceTaxPortfolioRail";
import FinanceTaxCloseGuidanceRail from "./FinanceTaxCloseGuidanceRail";
import FinanceTaxCloseIntelligenceRail from "./FinanceTaxCloseIntelligenceRail";
import FinanceTaxEvidenceDrilldownRail from "./FinanceTaxEvidenceDrilldownRail";
import FinanceTaxDependencyWorkRail from "./FinanceTaxDependencyWorkRail";
import FinanceTaxClientRequestBridgeRail from "./FinanceTaxClientRequestBridgeRail";
import FinanceTaxWorkflowNavigator from "./FinanceTaxWorkflowNavigator";

export default function FinanceTaxWorkCenter(props) {
  // One filing selection is authoritative for every entity-level Tax control below.
  const [selectedVatReturnId, setSelectedVatReturnIdState] = useState(null);
  const [activeStage, setActiveStage] = useState("RETURN");

  function setSelectedVatReturnId(nextId) {
    setSelectedVatReturnIdState(nextId);
    if (!nextId) setActiveStage("RETURN");
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
        onStageChange={setActiveStage}
        selectedVatReturnId={selectedVatReturnId}
      />

      {activeStage === "RETURN" ? <>
        <FinanceTaxCalendarRail organizationId={props.organizationId} entityId={props.entityId} selectedVatReturnId={selectedVatReturnId} />
        <FinanceTaxReturnCloseSheet
          organizationId={props.organizationId}
          entityId={props.entityId}
          selectedVatReturnId={selectedVatReturnId}
          onStageChange={setActiveStage}
        />
        <FinanceTaxLegacyWorkCenter
          {...props}
          selectedVatReturnId={selectedVatReturnId}
          onSelectedVatReturnIdChange={setSelectedVatReturnId}
        />
      </> : null}

      {activeStage === "FIX" ? <>
        <FinanceTaxCloseGuidanceRail organizationId={props.organizationId} entityId={props.entityId} selectedVatReturnId={selectedVatReturnId} />
        <FinanceTaxCloseIntelligenceRail organizationId={props.organizationId} entityId={props.entityId} selectedVatReturnId={selectedVatReturnId} />
        <FinanceTaxDependencyWorkRail organizationId={props.organizationId} entityId={props.entityId} selectedVatReturnId={selectedVatReturnId} />
        <FinanceTaxClientRequestBridgeRail organizationId={props.organizationId} entityId={props.entityId} selectedVatReturnId={selectedVatReturnId} />
      </> : null}

      {activeStage === "EVIDENCE" ? <FinanceTaxEvidenceDrilldownRail organizationId={props.organizationId} entityId={props.entityId} selectedVatReturnId={selectedVatReturnId} /> : null}

      {activeStage === "AFTER" ? <>
        <FinanceTaxAmendmentRail organizationId={props.organizationId} entityId={props.entityId} selectedVatReturnId={selectedVatReturnId} />
        <FinanceTaxSettlementRail organizationId={props.organizationId} entityId={props.entityId} selectedVatReturnId={selectedVatReturnId} />
      </> : null}
    </>
  );
}
