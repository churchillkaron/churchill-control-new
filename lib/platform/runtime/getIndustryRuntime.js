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

import {
  pestControlRuntime,
} from "@/lib/platform/industries/runtime/pestControl";

const runtimes = {

  hospitality:
    hospitalityRuntime,

  entertainment:
    entertainmentRuntime,

  accounting:
    accountingRuntime,

  construction:
    constructionRuntime,

  pest_control:
    pestControlRuntime,

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
