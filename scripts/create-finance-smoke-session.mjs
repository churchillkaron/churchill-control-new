#!/usr/bin/env node

import fs from "node:fs";
import process from "node:process";
import { createServerClient } from "@supabase/ssr";

function parseEnvFiles() {
  const values = {};

  for (const filename of [".env", ".env.local"]) {
    if (!fs.existsSync(filename)) continue;

    const content = fs.readFileSync(filename, "utf8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue