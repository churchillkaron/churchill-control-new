export const RUNTIME_CONTRACT = {
  version: "1.0.0",
  shape: "runtime.data",
  rules: [
    "UI must only consume runtime.data",
    "StudioRuntime must only produce runtime.data",
    "No sceneRuntime/taskRuntime/assetRuntime/shotRuntime allowed in UI",
    "No graph preloading allowed in StudioRuntime",
    "All creative modules must follow Finance pattern",
  ],
};
