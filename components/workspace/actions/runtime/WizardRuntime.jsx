"use client";

import BudgetWizard from "../wizards/BudgetWizard";

export default function WizardRuntime({
  action,
  ...props
}) {

  switch (action?.id) {

    case "budget":
      return (
        <BudgetWizard
          {...props}
        />
      );

    default:
      return null;

  }

}
