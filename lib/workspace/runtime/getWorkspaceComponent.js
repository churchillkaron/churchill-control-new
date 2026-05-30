import FinanceContent
from "@/app/(system)/finance/FinanceContent";

const moduleComponents = {

  finance:
    FinanceContent,

};

export function getWorkspaceComponent(
  moduleId
) {

  return (
    moduleComponents[
      moduleId
    ] || null
  );

}
