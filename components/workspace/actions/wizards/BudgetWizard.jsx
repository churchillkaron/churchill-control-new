"use client";

import CreateEngine from "@/components/workspace/master-data/CreateEngine";

export default function BudgetWizard(props) {

  return (
    <CreateEngine
      {...props}
      title="New Budget"
    />
  );

}
