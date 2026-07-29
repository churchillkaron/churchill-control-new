"use client";

import CreateEngine from "./CreateEngine";
import FinanceDimensionEngine from "./FinanceDimensionEngine";
import IntercompanyEngine, {
  isIntercompanyEngineAction,
} from "./IntercompanyEngine";

export default function CreateEngineRouter(props) {
  if (String(props.moduleKey || "").toLowerCase() === "dimensions") {
    return <FinanceDimensionEngine {...props} />;
  }

  if (isIntercompanyEngineAction(props.action, props.moduleKey)) {
    return <IntercompanyEngine {...props} />;
  }

  return <CreateEngine {...props} />;
}
