import {
  hospitalityRuntime,
} from "@/lib/platform/industries/runtime/hospitality";

import {
  entertainmentRuntime,
} from "@/lib/platform/industries/runtime/entertainment";

import {
  accountingRuntime,
} from "@/lib/platform/industries/runtime/accounting";

import {
  constructionRuntime,
} from "@/lib/platform/industries/runtime/construction";

const runtimes = {

  hospitality:
    hospitalityRuntime,

  entertainment:
    entertainmentRuntime,

  accounting:
    accountingRuntime,

  construction:
    constructionRuntime,

};

export function getIndustryRuntime(
  industry
) {

  return (
    runtimes[
      industry
    ] || null
  );

}
