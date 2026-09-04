"use client";

import FinanceTaxLegacyWorkCenter from "./FinanceTaxLegacyWorkCenter";
import FinanceTaxCalendarRail from "./FinanceTaxCalendarRail";
import FinanceTaxAmendmentRail from "./FinanceTaxAmendmentRail";
import FinanceTaxSettlementRail from "./FinanceTaxSettlementRail";
import FinanceTaxPortfolioRail from "./FinanceTaxPortfolioRail";

export default function FinanceTaxWorkCenter(props) {
  return (
    <>
      <FinanceTaxPortfolioRail organizationId={props.organizationId} entityId={props.entityId} />
      <FinanceTaxCalendarRail organizationId={props.organizationId} entityId={props.entityId} />
      <FinanceTaxAmendmentRail organizationId={props.organizationId} entityId={props.entityId} />
      <FinanceTaxSettlementRail organizationId={props.organizationId} entityId={props.entityId} />
      <FinanceTaxLegacyWorkCenter {...props} />
    </>
  );
}
