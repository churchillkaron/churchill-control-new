#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const CONTRACT = "CREATIVE_VERSIONED_DIRECTION_APPROVAL_PACKET_V3";
const ENVELOPE_CONTRACT = "CREATIVE_VERSIONED_DIRECTION_APPROVAL_ENVELOPE_V3";
const APPROVAL_CONTRACT = "CREATIVE_DIRECTION_BUDGET_APPROVAL_V2";

function text(value) {
  return String(value ?? "