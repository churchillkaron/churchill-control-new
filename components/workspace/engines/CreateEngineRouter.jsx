"use client";

import CreateEngine from "./CreateEngine";
import IntercompanyEngine, {
  isIntercompanyEngineAction,
} from "./IntercompanyEngine";

export default function CreateEngineRouter(props) {
  if (isIntercompanyEngineAction(props.action, props.moduleKey)) {
    return <IntercompanyEngine {...props} />;
  }

  return <CreateEngine {...props} />;
}
