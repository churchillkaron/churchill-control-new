"use client";

import { useState } from "react";
import FinanceTaxLegacyWorkCenter from "./FinanceTaxLegacyWorkCenter";
import FinanceTaxCalendarRail from "./FinanceTaxCalendarRail";
import FinanceTaxAmendmentRail from "./FinanceTaxAmendmentRail";
import FinanceTaxSettlementRail from "./FinanceTaxSettlementRail";
import FinanceTaxPortfolioRail from "./FinanceTaxPortfolioRail";
import FinanceTaxCloseGuidanceRail from "./FinanceTaxCloseGuidanceRail";

export default function FinanceTaxWorkCenter(props) {
  // One filing selection is authoritative for every entity-level Tax control below.
  const [selectedVatReturnId, setSelectedVatReturnId] = useState(null);

  return (
    <>
      <FinanceTaxPortfolioRail organizationId={props.organizationId} entityId={props.entityId} />
      <FinanceTaxCalendarRail organizationId={props.organizationId} entityId={props.entityId} selectedVatReturnId={selectedVatReturnId} />
      <FinanceTaxCloseGuidanceRail organizationId={props.organizationId} entityId={props.entityId} selectedVatReturnId={selectedVatReturnId} />
      <FinanceTaxAmendmentRail organizationId={props.organizationId} entityId={props.entityId} selectedVatReturnId={selectedVatReturnId} />
      <FinanceTaxSettlementRail organizationId={props.organizationId} entityId={props.entityId} selectedVatReturnId={selectedVatReturnId} />
      <FinanceTaxLegacyWorkCenter
        {...props}
        selectedVatReturnId={selectedVatReturnId}
        onSelectedVatReturnIdChange={setSelectedVatReturnId}
      />
    </>
  );
}
