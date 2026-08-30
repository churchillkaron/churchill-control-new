import {
  deleteVideoPod,
  getVideoPod,
  podTerminal,
  text,
} from "./AvantiqoVideoPodRunpod.js";

export const AVANTIQO_VIDEO_POD_TERMINATION_CONTRACT = "AVANTIQO_VIDEO_POD_TERMINATION_CONFIRMATION_V1";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const finitePositive = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
};

export async function confirmAvantiqoVideoPodTerminal(
  podId,
  {
    timeoutMs = 120_000,
    pollMs = 3_000,
    retryDelete = true,
  } = {},
) {
  const id = text(podId);
  if (!id) {
    return {
      success: true,
      contract: AVANTIQO_VIDEO_POD_TERMINATION_CONTRACT,
      pod_id: null,
      confirmed_terminal: true,
      terminal_state: "MISSING_ID",
      delete_retry_attempts: 0,
    };
  }

  const deadline = Date.now() + finitePositive(timeoutMs, 120_000);
  const interval = finitePositive(pollMs, 3_000);
  let deleteRetryAttempts = 0;
  let lastInspectionError = null;
  let lastDeleteError = null;

  while (Date.now() < deadline) {
    let current = null;
    let inspected = false;
    try {
      current = await getVideoPod(id);
      inspected = true;
      lastInspectionError = null;
    } catch (error) {
      lastInspectionError = text(error?.message || error).slice(0, 180) || "UNKNOWN";
    }

    if (inspected && !current) {
      return {
        success: true,
        contract: AVANTIQO_VIDEO_POD_TERMINATION_CONTRACT,
        pod_id: id,
        confirmed_terminal: true,
        terminal_state: "ABSENT",
        delete_retry_attempts: deleteRetryAttempts,
      };
    }

    if (inspected && podTerminal(current)) {
      return {
        success: true,
        contract: AVANTIQO_VIDEO_POD_TERMINATION_CONTRACT,
        pod_id: id,
        confirmed_terminal: true,
        terminal_state: "TERMINAL",
        delete_retry_attempts: deleteRetryAttempts,
      };
    }

    if (retryDelete && deleteRetryAttempts < 3) {
      deleteRetryAttempts += 1;
      try {
        await deleteVideoPod(id);
        lastDeleteError = null;
      } catch (error) {
        lastDeleteError = text(error?.message || error).slice(0, 180) || "UNKNOWN";
      }
    }

    await sleep(interval);
  }

  const detail = [lastInspectionError, lastDeleteError].filter(Boolean).join("|") || "STILL_ACTIVE";
  throw new Error(`AVANTIQO_VIDEO_POD_TERMINATION_TIMEOUT:${id}:${detail}`);
}
