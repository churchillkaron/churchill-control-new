#!/usr/bin/env node

import WebSocket from "ws";

if (!globalThis.WebSocket) {
  globalThis.WebSocket = WebSocket;
}

await import("./creative-studio-churchill-short-ad-preflight.mjs");
