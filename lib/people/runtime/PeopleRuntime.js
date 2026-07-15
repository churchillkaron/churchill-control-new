import buildPeopleStaffRuntime from "@/lib/people/runtime/buildPeopleStaffRuntime";
import { HrRuntime } from "@/lib/people/hr/runtime/HrRuntime";

export function buildPeopleRuntime(context = {}) {

  return {

    ...HrRuntime,

    staff:
      buildPeopleStaffRuntime(context),

  };

}

export {
  HrRuntime,
};

export default buildPeopleRuntime;
