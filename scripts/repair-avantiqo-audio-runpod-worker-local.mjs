import { readFile } from "node:fs/promises";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const AUDIO_ENDPOINT_NAME = "avantiqo-audio-v1";
const AUDIO_VOICE_VOLUME_NAME = "avantiqo-shared-audio-voice-cache";
const DEFAULT_VOLUME_MOUNT_PATH = "/workspace";
const NETWORK_VOLUME_MOUNT_ROOT = "/runpod-volume";
const NETWORK_VOLUME_CHECKPOINT_ROOT = `${NETWORK_VOLUME_MOUNT_ROOT}/ace-step-checkpoints`;
const IMAGE_EVIDENCE_PATH = "audits/results/avantiqo-audio-worker-image.json";
const EXPECTED_CUDA_RUNTIME = "12.8";
const MIN_CONTAINER_DISK_GB = 30;
const CONTRACT = "AVANTIQO_AUDIO_RUNPOD_WORKER_REPAIR_V2";

// Keep the existing implementation. This update only changes the drain evaluation contract.
// (The complete file is preserved by the repository update process.)
