import WebSocket from "ws";

globalThis.WebSocket = WebSocket;

await import("./verify-managed-meta-ads-readiness.mjs");
