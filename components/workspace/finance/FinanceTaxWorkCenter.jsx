"use client";

import FinanceTaxLegacyWorkCenter from "./FinanceTaxLegacyWorkCenter";
import FinanceTaxCalendarRail from "./FinanceTaxCalendarRail";

export default function FinanceTaxWorkCenter(props) {
  return (
    <>
      <FinanceTaxCalendarRail organizationId={props.organizationId} entityId={props.entityId} />
      <FinanceTaxLegacyWorkCenter {...props} />
    </>
  );
}
