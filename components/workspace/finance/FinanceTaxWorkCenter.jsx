"use client";

import FinanceTaxLegacyWorkCenter from "./FinanceTaxLegacyWorkCenter";
import FinanceTaxCalendarRail from "./FinanceTaxCalendarRail";
import FinanceTaxAmendmentRail from "./FinanceTaxAmendmentRail";

export default function FinanceTaxWorkCenter(props) {
  return (
    <>
      <FinanceTaxCalendarRail organizationId={props.organizationId} entityId={props.entityId} />
      <FinanceTaxAmendmentRail organizationId={props.organizationId} entityId={props.entityId} />
      <FinanceTaxLegacyWorkCenter {...props} />
    </>
  );
}
